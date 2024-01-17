/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import memoize from 'memoize-immutable';
import {
  withChartViewport,
  type WithChartViewport,
  type Viewport,
} from '../shared/chart/Viewport';
import { ChartCanvas } from '../shared/chart/Canvas';
import { FastFillStyle } from '../../utils';
import TextMeasurement from '../../utils/text-measurement';
import { mapCategoryColorNameToStackChartStyles } from '../../utils/colors';
import {
  formatCallNodeNumberWithUnit,
  formatPercent,
} from 'firefox-profiler/utils/format-numbers';
import { TooltipCallNode } from 'firefox-profiler/components/tooltip/CallNode';
import { getTimingsForCallNodeIndex } from 'firefox-profiler/profile-logic/profile-data';
import MixedTupleMap from 'mixedtuplemap';

import type {
  Thread,
  CategoryList,
  CssPixels,
  Milliseconds,
  CallNodeInfo,
  IndexIntoCallNodeTable,
  CallTreeSummaryStrategy,
  WeightType,
  SamplesLikeTable,
  TracedTiming,
  InnerWindowID,
  Page,
} from 'firefox-profiler/types';

import type {
  FlameGraphTiming,
  FlameGraphDepth,
  IndexIntoFlameGraphTiming,
} from 'firefox-profiler/profile-logic/flame-graph';

import type { CallTree } from 'firefox-profiler/profile-logic/call-tree';

export type OwnProps = {|
  +thread: Thread,
  +weightType: WeightType,
  +innerWindowIDToPageMap: Map<InnerWindowID, Page> | null,
  +unfilteredThread: Thread,
  +sampleIndexOffset: number,
  +maxStackDepth: number,
  +flameGraphTiming: FlameGraphTiming,
  +callNodeInfo: CallNodeInfo,
  +callTree: CallTree,
  +stackFrameHeight: CssPixels,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +rightClickedCallNodeIndex: IndexIntoCallNodeTable | null,
  +onSelectionChange: (IndexIntoCallNodeTable | null) => void,
  +onRightClick: (IndexIntoCallNodeTable | null) => void,
  +onDoubleClick: (IndexIntoCallNodeTable | null) => void,
  +shouldDisplayTooltips: () => boolean,
  +scrollToSelectionGeneration: number,
  +categories: CategoryList,
  +interval: Milliseconds,
  +isInverted: boolean,
  +callTreeSummaryStrategy: CallTreeSummaryStrategy,
  +samples: SamplesLikeTable,
  +unfilteredSamples: SamplesLikeTable,
  +tracedTiming: TracedTiming | null,
  +displayImplementation: boolean,
  +displayStackType: boolean,
|};

type Props = {|
  ...OwnProps,
  // Bring in the viewport props from the higher order Viewport component.
  +viewport: Viewport,
|};

type HoveredStackTiming = {|
  +depth: FlameGraphDepth,
  +flameGraphTimingIndex: IndexIntoFlameGraphTiming,
|};

import './Canvas.css';
import { convertStackToCallNodeAndCategoryPath } from '../../profile-logic/profile-data';

const ROW_HEIGHT = 16;
const TEXT_OFFSET_START = 3;
const TEXT_OFFSET_TOP = 11;

class FlameGraphCanvasImpl extends React.PureComponent<Props> {
  _textMeasurement: null | TextMeasurement;

  componentDidUpdate(prevProps) {
    // If the stack depth changes (say, when changing the time range
    // selection or applying a transform), move the viewport
    // vertically so that its offset from the base of the flame graph
    // is maintained.
    if (prevProps.maxStackDepth !== this.props.maxStackDepth) {
      this.props.viewport.moveViewport(
        0,
        (prevProps.maxStackDepth - this.props.maxStackDepth) * ROW_HEIGHT
      );
    }

    // We want to scroll the selection into view when this component
    // is mounted, but using componentDidMount won't work here as the
    // viewport will not have completed setting its size by
    // then. Instead, look for when the viewport's isSizeSet prop
    // changes to true.
    const viewportDidMount =
      !prevProps.viewport.isSizeSet && this.props.viewport.isSizeSet;

    if (
      viewportDidMount ||
      this.props.scrollToSelectionGeneration >
        prevProps.scrollToSelectionGeneration
    ) {
      this._scrollSelectionIntoView();
    }
  }

  _scrollSelectionIntoView = () => {
    const {
      selectedCallNodeIndex,
      maxStackDepth,
      callNodeInfo: { callNodeTable },
    } = this.props;

    if (selectedCallNodeIndex === null) {
      return;
    }

    const depth = callNodeTable.depth[selectedCallNodeIndex];
    const y = (maxStackDepth - depth - 1) * ROW_HEIGHT;

    if (y < this.props.viewport.viewportTop) {
      this.props.viewport.moveViewport(0, this.props.viewport.viewportTop - y);
    } else if (y + ROW_HEIGHT > this.props.viewport.viewportBottom) {
      this.props.viewport.moveViewport(
        0,
        this.props.viewport.viewportBottom - (y + ROW_HEIGHT)
      );
    }
  };

  _drawCanvas = (
    ctx: CanvasRenderingContext2D,
    hoveredItem: HoveredStackTiming | null
  ) => {
    const {
      thread,
      flameGraphTiming,
      callNodeInfo: { callNodeTable },
      stackFrameHeight,
      maxStackDepth,
      rightClickedCallNodeIndex,
      selectedCallNodeIndex,
      categories,
      viewport: {
        containerWidth,
        containerHeight,
        viewportTop,
        viewportBottom,
      },
    } = this.props;
   
    // Ensure the text measurement tool is created, since this is the first time
    // this class has access to a ctx.
    if (!this._textMeasurement) {
      this._textMeasurement = new TextMeasurement(ctx);
    }
    const textMeasurement = this._textMeasurement;
    const fastFillStyle = new FastFillStyle(ctx);

    fastFillStyle.set('#ffffff');
    ctx.fillRect(0, 0, containerWidth, containerHeight);

    const startDepth = Math.floor(
      maxStackDepth - viewportBottom / stackFrameHeight
    );
    const endDepth = Math.ceil(maxStackDepth - viewportTop / stackFrameHeight);

    // Only draw the stack frames that are vertically within view.
    for (let depth = startDepth; depth < endDepth; depth++) {
      // Get the timing information for a row of stack frames.
      const stackTiming = flameGraphTiming[depth];

      if (!stackTiming) {
        continue;
      }
      
      for (let i = 0; i < stackTiming.length; i++) {
        const startTime = stackTiming.start[i];
        const endTime = stackTiming.end[i];
        
        const w: CssPixels = (endTime - startTime) * containerWidth;
        if (w < 2) {
          // Skip sending draw calls for sufficiently small boxes.
          continue;
        }
        const x: CssPixels = startTime * containerWidth;
        const y: CssPixels =
          (maxStackDepth - depth - 1) * ROW_HEIGHT - viewportTop;
        const h: CssPixels = ROW_HEIGHT - 1;

        const callNodeIndex = stackTiming.callNode[i];
        const isSelected = selectedCallNodeIndex === callNodeIndex;
        const isRightClicked = rightClickedCallNodeIndex === callNodeIndex;
        const isHovered =
          hoveredItem &&
          depth === hoveredItem.depth &&
          i === hoveredItem.flameGraphTimingIndex;
        const isHighlighted = isSelected || isRightClicked || isHovered;

        const categoryIndex = callNodeTable.category[callNodeIndex];
        const category = categories[categoryIndex];
        const colorStyles = mapCategoryColorNameToStackChartStyles(
          category.color
        );

        const background = isHighlighted
          ? colorStyles.selectedFillStyle
          : colorStyles.unselectedFillStyle;//变换背景颜色

        fastFillStyle.set(background);
        // Draw rect at an offset to ensure spacing between blocks.
        ctx.fillRect(x + 1, y, w - 1, h);

        // TODO - L10N RTL.
        // Constrain the x coordinate to the leftmost area.
        const x2: CssPixels = Math.max(x, 0) + TEXT_OFFSET_START;
        const w2: CssPixels = Math.max(0, w - (x2 - x));
        if (w2 > textMeasurement.minWidth) {
          const funcIndex = callNodeTable.func[callNodeIndex];
          const funcName = thread.stringTable.getString(
            thread.funcTable.name[funcIndex]
          );
          const fittedText = textMeasurement.getFittedText(funcName, w2);
          if (fittedText) {
            const foreground = isHighlighted
              ? colorStyles.selectedTextColor
              : '#000';
            fastFillStyle.set(foreground);
            ctx.fillText(fittedText, x2, y + TEXT_OFFSET_TOP);
          }
        }
      }
    }
  };

  // Properly memoize this derived information for the Tooltip component.
  _getTimingsForCallNodeIndex = memoize(getTimingsForCallNodeIndex, {
    cache: new MixedTupleMap(),
  });

  _getHoveredStackInfo = ({
    depth,
    flameGraphTimingIndex,
  }: HoveredStackTiming): React.Node => {
    const {
      thread,
      unfilteredThread,
      sampleIndexOffset,
      flameGraphTiming,
      callTree,
      callNodeInfo,
      shouldDisplayTooltips,
      categories,
      interval,
      isInverted,
      callTreeSummaryStrategy,
      innerWindowIDToPageMap,
      weightType,
      samples,
      unfilteredSamples,
      tracedTiming,
      displayImplementation,
      displayStackType,
    } = this.props;

    if (!shouldDisplayTooltips()) {
      return null;
    }

    const stackTiming = flameGraphTiming[depth];
    const callNodeIndex = stackTiming.callNode[flameGraphTimingIndex];
    const ratio =
      stackTiming.end[flameGraphTimingIndex] -
      stackTiming.start[flameGraphTimingIndex];

    let percentage = formatPercent(ratio);
    if (tracedTiming) {
      const time = formatCallNodeNumberWithUnit(
        'tracing-ms',
        false,
        tracedTiming.running[callNodeIndex]
      );
      percentage = `${time} (${percentage})`;
    }

    const shouldComputeTimings =
      // This is currently too slow for JS Tracer threads.
      !thread.isJsTracer &&
      // Only calculate this if our summary strategy is actually timing related.
      // This function could be made more generic to handle other summary
      // strategies, but it may not be worth implementing it.
      callTreeSummaryStrategy === 'timing';

    return (
      // Important! Only pass in props that have been properly memoized so this component
      // doesn't over-render.
      <TooltipCallNode
        thread={thread}
        weightType={weightType}
        innerWindowIDToPageMap={innerWindowIDToPageMap}
        interval={interval}
        callNodeIndex={callNodeIndex}
        callNodeInfo={callNodeInfo}
        categories={categories}
        durationText={percentage}
        callTree={callTree}
        callTreeSummaryStrategy={callTreeSummaryStrategy}
        timings={
          shouldComputeTimings
            ? this._getTimingsForCallNodeIndex(
                callNodeIndex,
                callNodeInfo,
                interval,
                isInverted,
                thread,
                unfilteredThread,
                sampleIndexOffset,
                categories,
                samples,
                unfilteredSamples,
                displayImplementation
              )
            : undefined
        }
        displayStackType={displayStackType}
      />
    );
  };

  _getCallNodeIndexFromHoveredItem(
    hoveredItem: HoveredStackTiming | null
  ): IndexIntoCallNodeTable | null {
    if (hoveredItem === null) {
      return null;
    }

    const { depth, flameGraphTimingIndex } = hoveredItem;
    const { flameGraphTiming } = this.props;
    const stackTiming = flameGraphTiming[depth];
    const callNodeIndex = stackTiming.callNode[flameGraphTimingIndex];
    return callNodeIndex;
  }

  _onSelectItem = (hoveredItem: HoveredStackTiming | null) => {
    // Change our selection to the hovered item, or deselect (with
    // null) if there's nothing hovered.
    const callNodeIndex = this._getCallNodeIndexFromHoveredItem(hoveredItem);
    this.props.onSelectionChange(callNodeIndex);
  };

  _onRightClick = (hoveredItem: HoveredStackTiming | null) => {
    // Change our selection to the hovered item, or deselect (with
    // null) if there's nothing hovered.
    const callNodeIndex = this._getCallNodeIndexFromHoveredItem(hoveredItem);
    this.props.onRightClick(callNodeIndex);
  };

  _onDoubleClick = (hoveredItem: HoveredStackTiming | null) => {
    const callNodeIndex = this._getCallNodeIndexFromHoveredItem(hoveredItem);
    this.props.onDoubleClick(callNodeIndex);
  };

  _hitTest = (x: CssPixels, y: CssPixels): HoveredStackTiming | null => {
    const {
      flameGraphTiming,
      maxStackDepth,
      viewport: { viewportTop, containerWidth },
    } = this.props;
    const pos = x / containerWidth;
    const depth = Math.floor(maxStackDepth - (y + viewportTop) / ROW_HEIGHT);
    const stackTiming = flameGraphTiming[depth];

    if (!stackTiming) {
      return null;
    }

    for (let i = 0; i < stackTiming.length; i++) {
      const start = stackTiming.start[i];
      const end = stackTiming.end[i];
      if (start < pos && end > pos) {
        return { depth, flameGraphTimingIndex: i };
      }
    }

    return null;
  };

  render() {
    const { containerWidth, containerHeight, isDragging } = this.props.viewport;

    return (
      <ChartCanvas
        className="flameGraphCanvas"
        containerWidth={containerWidth}
        containerHeight={containerHeight}
        isDragging={isDragging}
        scaleCtxToCssPixels={true}
        onDoubleClickItem={this._onDoubleClick}
        getHoveredItemInfo={this._getHoveredStackInfo}
        drawCanvas={this._drawCanvas}
        hitTest={this._hitTest}
        onSelectItem={this._onSelectItem}
        onRightClick={this._onRightClick}
        drawCanvasAfterRaf={false}
      />
    );
  }
}

export const FlameGraphCanvas = (withChartViewport: WithChartViewport<
  OwnProps,
  Props
>)(FlameGraphCanvasImpl);
