/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import memoize from 'memoize-immutable';
import MixedTupleMap from 'mixedtuplemap';
import { oneLine } from 'common-tags';
import {
  resourceTypes,
  getEmptyUnbalancedNativeAllocationsTable,
  getEmptyBalancedNativeAllocationsTable,
  getEmptyStackTable,
  shallowCloneFrameTable,
} from './data-structures';
import {
  INSTANT,
  INTERVAL,
  INTERVAL_START,
  INTERVAL_END,
} from 'firefox-profiler/app-logic/constants';
import { timeCode } from 'firefox-profiler/utils/time-code';
import { hashPath } from 'firefox-profiler/utils/path';
import { bisectionRight, bisectionLeft } from 'firefox-profiler/utils/bisect';
import { parseFileNameFromSymbolication } from 'firefox-profiler/utils/special-paths';
import {
  assertExhaustiveCheck,
  ensureExists,
  getFirstItemFromSet,
} from 'firefox-profiler/utils/flow';

import type {
  Profile,
  Thread,
  SamplesTable,
  StackTable,
  FrameTable,
  FuncTable,
  NativeSymbolTable,
  ResourceTable,
  CategoryList,
  IndexIntoCategoryList,
  IndexIntoSubcategoryListForCategory,
  IndexIntoFuncTable,
  IndexIntoSamplesTable,
  IndexIntoStackTable,
  IndexIntoResourceTable,
  IndexIntoNativeSymbolTable,
  ThreadIndex,
  Category,
  Counter,
  CounterSamplesTable,
  NativeAllocationsTable,
  InnerWindowID,
  BalancedNativeAllocationsTable,
  IndexIntoFrameTable,
  PageList,
  CallNodeInfo,
  CallNodeTable,
  CallNodePath,
  CallNodeAndCategoryPath,
  IndexIntoCallNodeTable,
  AccumulatedCounterSamples,
  SamplesLikeTable,
  SelectedState,
  ProfileFilterPageData,
  Milliseconds,
  StartEndRange,
  ImplementationFilter,
  CallTreeSummaryStrategy,
  EventDelayInfo,
  ThreadsKey,
  resourceTypeEnum,
  MarkerPayload,
  Address,
  AddressProof,
  TimelineType,
  NativeSymbolInfo,
  BottomBoxInfo,
  Bytes,
} from 'firefox-profiler/types';
import type { UniqueStringArray } from 'firefox-profiler/utils/unique-string-array';

/**
 * Various helpers for dealing with the profile as a data structure.
 * @module profile-data
 */

/**
 * Generate the CallNodeInfo which contains the CallNodeTable, and a map to convert
 * an IndexIntoStackTable to a IndexIntoCallNodeTable. This function runs through
 * a stackTable, and de-duplicates stacks that have frames that point to the same
 * function.
 *
 * See `src/types/profile-derived.js` for the type definitions.
 * See `docs-developer/call-trees.md` for a detailed explanation of CallNodes.
 */
export function getCallNodeInfo(
  stackTable: StackTable,
  frameTable: FrameTable,
  funcTable: FuncTable,
  defaultCategory: IndexIntoCategoryList
): CallNodeInfo {
  return timeCode('getCallNodeInfo', () => {
    const stackIndexToCallNodeIndex = new Uint32Array(stackTable.length);
    const funcCount = funcTable.length;
    // Maps can't key off of two items, so combine the prefixCallNode and the funcIndex
    // using the following formula: prefixCallNode * funcCount + funcIndex => callNode
    const prefixCallNodeAndFuncToCallNodeMap = new Map();

    // The callNodeTable components.
    const prefix: Array<IndexIntoCallNodeTable> = [];
    const func: Array<IndexIntoFuncTable> = [];
    const category: Array<IndexIntoCategoryList> = [];
    const subcategory: Array<IndexIntoSubcategoryListForCategory> = [];
    const innerWindowID: Array<InnerWindowID> = [];
    const depth: Array<number> = [];
    const sourceFramesInlinedIntoSymbol: Array<
      IndexIntoNativeSymbolTable | -1 | null
    > = [];
    let length = 0;

    function addCallNode(
      prefixIndex: IndexIntoCallNodeTable,
      funcIndex: IndexIntoFuncTable,
      categoryIndex: IndexIntoCategoryList,
      subcategoryIndex: IndexIntoSubcategoryListForCategory,
      windowID: InnerWindowID,
      inlinedIntoSymbol: IndexIntoNativeSymbolTable | null
    ) {
      const index = length++;
      prefix[index] = prefixIndex;
      func[index] = funcIndex;
      category[index] = categoryIndex;
      subcategory[index] = subcategoryIndex;
      innerWindowID[index] = windowID;
      sourceFramesInlinedIntoSymbol[index] = inlinedIntoSymbol;
      if (prefixIndex === -1) {
        depth[index] = 0;
      } else {
        depth[index] = depth[prefixIndex] + 1;
      }
    }

    // Go through each stack, and create a new callNode table, which is based off of
    // functions rather than frames.
    for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
      const prefixStack = stackTable.prefix[stackIndex];
      // We know that at this point the following condition holds:
      // assert(prefixStack === null || prefixStack < stackIndex);
      const prefixCallNode =
        prefixStack === null ? -1 : stackIndexToCallNodeIndex[prefixStack];
      const frameIndex = stackTable.frame[stackIndex];
      const categoryIndex = stackTable.category[stackIndex];
      const subcategoryIndex = stackTable.subcategory[stackIndex];
      const windowID = frameTable.innerWindowID[frameIndex] || 0;
      const inlinedIntoSymbol =
        frameTable.inlineDepth[frameIndex] > 0
          ? frameTable.nativeSymbol[frameIndex]
          : null;
      const funcIndex = frameTable.func[frameIndex];
      const prefixCallNodeAndFuncIndex = prefixCallNode * funcCount + funcIndex;

      // Check if the call node for this stack already exists.
      let callNodeIndex = prefixCallNodeAndFuncToCallNodeMap.get(
        prefixCallNodeAndFuncIndex
      );
      if (callNodeIndex === undefined) {
        // New call node.
        callNodeIndex = length;
        addCallNode(
          prefixCallNode,
          funcIndex,
          categoryIndex,
          subcategoryIndex,
          windowID,
          inlinedIntoSymbol
        );
        prefixCallNodeAndFuncToCallNodeMap.set(
          prefixCallNodeAndFuncIndex,
          callNodeIndex
        );
      } else {
        // There is already a call node for this function. Use it, and check if
        // there are any conflicts between the various stack nodes that have been
        // merged into it.

        // Resolve category conflicts, by resetting a conflicting subcategory or
        // category to the default category.
        if (category[callNodeIndex] !== categoryIndex) {
          // Conflicting origin stack categories -> default category + subcategory.
          category[callNodeIndex] = defaultCategory;
          subcategory[callNodeIndex] = 0;
        } else if (subcategory[callNodeIndex] !== subcategoryIndex) {
          // Conflicting origin stack subcategories -> "Other" subcategory.
          subcategory[callNodeIndex] = 0;
        }

        // Resolve "inlined into" conflicts. This can happen if you have two
        // function calls A -> B where only one of the B calls is inlined, or
        // if you use call tree transforms in such a way that a function B which
        // was inlined into two different callers (A -> B, C -> B) gets collapsed
        // into one call node.
        if (
          sourceFramesInlinedIntoSymbol[callNodeIndex] !== inlinedIntoSymbol
        ) {
          // Conflicting inlining: -1.
          sourceFramesInlinedIntoSymbol[callNodeIndex] = -1;
        }
      }
      stackIndexToCallNodeIndex[stackIndex] = callNodeIndex;
    }

    const callNodeTable: CallNodeTable = {
      prefix: new Int32Array(prefix),
      func: new Int32Array(func),
      category: new Int32Array(category),
      subcategory: new Int32Array(subcategory),
      innerWindowID: new Float64Array(innerWindowID),
      sourceFramesInlinedIntoSymbol,
      depth,
      length,
    };

    return { callNodeTable, stackIndexToCallNodeIndex };
  });
}

/**
 * Take a samples table, and return an array that contain indexes that point to the
 * leaf most call node, or null.
 */
export function getSampleIndexToCallNodeIndex(
  stacks: Array<IndexIntoStackTable | null>,
  stackIndexToCallNodeIndex: {
    [key: IndexIntoStackTable]: IndexIntoCallNodeTable,
  }
): Array<IndexIntoCallNodeTable | null> {
  return stacks.map((stack) => {
    return stack === null ? null : stackIndexToCallNodeIndex[stack];
  });
}

/**
 * Go through the samples, and determine their current state.
 *
 * For samples that are neither 'FILTERED_OUT_*' nor 'SELECTED', this function compares
 * the sample's call node to the selected call node, in tree order. It uses the same
 * ordering as the function compareCallNodes in getTreeOrderComparator. But it does not
 * call compareCallNodes with the selected node for each sample's call node, because doing
 * so would recompute information about the selected call node on every call. Instead, it
 * has an equivalent implementation that is faster because it only computes information
 * about the selected call node's ancestors once.
 */
export function getSamplesSelectedStates(
  callNodeTable: CallNodeTable,
  sampleCallNodes: Array<IndexIntoCallNodeTable | null>,
  activeTabFilteredCallNodes: Array<IndexIntoCallNodeTable | null>,
  selectedCallNodeIndex: IndexIntoCallNodeTable | null
): SelectedState[] {
  const result = new Array(sampleCallNodes.length);

  // Precompute an array containing the call node indexes for the selected call
  // node and its parents up to the root.
  // The case of when we have no selected call node is a special case: we won't
  // use these values but we still compute them to make the code simpler later.
  const selectedCallNodeDepth =
    selectedCallNodeIndex === -1 || selectedCallNodeIndex === null
      ? 0
      : callNodeTable.depth[selectedCallNodeIndex];

  const selectedCallNodeAtDepth: IndexIntoCallNodeTable[] = new Array(
    selectedCallNodeDepth
  );

  for (
    let callNodeIndex = selectedCallNodeIndex, depth = selectedCallNodeDepth;
    depth >= 0 && callNodeIndex !== null;
    depth--, callNodeIndex = callNodeTable.prefix[callNodeIndex]
  ) {
    selectedCallNodeAtDepth[depth] = callNodeIndex;
  }

  /**
   * Take a call node, and compute its selected state.
   */
  function getSelectedStateFromCallNode(
    callNode: IndexIntoCallNodeTable | null,
    activeTabFilteredCallNode: IndexIntoCallNodeTable | null
  ): SelectedState {
    let callNodeIndex = callNode;
    if (callNodeIndex === null) {
      return activeTabFilteredCallNode === null
        ? // This sample was not part of the active tab.
          'FILTERED_OUT_BY_ACTIVE_TAB'
        : // This sample was filtered out in the transform pipeline.
          'FILTERED_OUT_BY_TRANSFORM';
    }

    // When there's no selected call node, we don't want to shadow everything
    // because everything is unselected. So let's decide this is as if
    // everything is selected so that anything not filtered out will be nicely
    // visible.
    if (selectedCallNodeIndex === null) {
      return 'SELECTED';
    }

    // Walk the call nodes toward the root, and get the call node at the depth
    // of the selected call node.
    let depth = callNodeTable.depth[callNodeIndex];
    while (depth > selectedCallNodeDepth) {
      callNodeIndex = callNodeTable.prefix[callNodeIndex];
      depth--;
    }

    if (callNodeIndex === selectedCallNodeIndex) {
      // This sample's call node at the depth matches the selected call node.
      return 'SELECTED';
    }

    // If we're here, it means that callNode is not selected, because it's not
    // an ancestor of selectedCallNodeIndex.
    // Determine if it's ordered "before" or "after" the selected call node,
    // in order to provide a stable ordering when rendering visualizations.
    // Walk the call nodes towards the root, until we find the common ancestor.
    // Once we've found the common ancestor, compare the order of the two
    // child nodes that we passed through, which are siblings.
    while (true) {
      const prevCallNodeIndex = callNodeIndex;
      callNodeIndex = callNodeTable.prefix[callNodeIndex];
      depth--;
      if (
        callNodeIndex === -1 ||
        callNodeIndex === selectedCallNodeAtDepth[depth]
      ) {
        // callNodeIndex is the lowest common ancestor of selectedCallNodeIndex
        // and callNode. Compare the order of the two children that we passed
        // through on the way up to the ancestor. These nodes are siblings, so
        // their order is defined by the numerical order of call node indexes.
        return prevCallNodeIndex <= selectedCallNodeAtDepth[depth + 1]
          ? 'UNSELECTED_ORDERED_BEFORE_SELECTED'
          : 'UNSELECTED_ORDERED_AFTER_SELECTED';
      }
    }

    // This code is unreachable, but Flow doesn't know that and thinks this
    // function could return undefined. So throw an error.
    /* eslint-disable no-unreachable */
    throw new Error('unreachable');
    /* eslint-enable no-unreachable */
  }

  // Go through each sample, and label its state.
  for (
    let sampleIndex = 0;
    sampleIndex < sampleCallNodes.length;
    sampleIndex++
  ) {
    result[sampleIndex] = getSelectedStateFromCallNode(
      sampleCallNodes[sampleIndex],
      activeTabFilteredCallNodes[sampleIndex]
    );
  }
  return result;
}

/**
 * This function returns the function index for a specific call node path. This
 * is the last element of this path, or the leaf element of the path.
 */
export function getLeafFuncIndex(path: CallNodePath): IndexIntoFuncTable {
  if (path.length === 0) {
    throw new Error("getLeafFuncIndex assumes that the path isn't empty.");
  }

  return path[path.length - 1];
}

export type JsImplementation =
  | 'interpreter'
  | 'blinterp'
  | 'baseline'
  | 'ion'
  | 'unknown';
export type StackImplementation = 'native' | JsImplementation;
export type BreakdownByImplementation = { [StackImplementation]: Milliseconds };
export type OneCategoryBreakdown = {|
  entireCategoryValue: Milliseconds,
  subcategoryBreakdown: Milliseconds[], // { [IndexIntoSubcategoryList]: Milliseconds }
|};
export type BreakdownByCategory = OneCategoryBreakdown[]; // { [IndexIntoCategoryList]: OneCategoryBreakdown }
export type ItemTimings = {|
  selfTime: {|
    // time spent excluding children
    value: Milliseconds,
    breakdownByImplementation: BreakdownByImplementation | null,
    breakdownByCategory: BreakdownByCategory | null,
  |},
  totalTime: {|
    // time spent including children
    value: Milliseconds,
    breakdownByImplementation: BreakdownByImplementation | null,
    breakdownByCategory: BreakdownByCategory | null,
  |},
|};

export type TimingsForPath = {|
  // timings for this path
  forPath: ItemTimings,
  // timings for this func across the tree
  forFunc: ItemTimings,
  rootTime: Milliseconds, // time for all the samples in the current tree
|};

/**
 * This function is the same as getTimingsForPath, but accepts an IndexIntoCallNodeTable
 * instead of a CallNodePath.
 */
export function getTimingsForPath(
  needlePath: CallNodePath,
  callNodeInfo: CallNodeInfo,
  interval: Milliseconds,
  isInvertedTree: boolean,
  thread: Thread,
  unfilteredThread: Thread,
  sampleIndexOffset: number,
  categories: CategoryList,
  samples: SamplesLikeTable,
  unfilteredSamples: SamplesLikeTable,
  displayImplementation: boolean
) {
  return getTimingsForCallNodeIndex(
    getCallNodeIndexFromPath(needlePath, callNodeInfo.callNodeTable),
    callNodeInfo,
    interval,
    isInvertedTree,
    thread,
    unfilteredThread,
    sampleIndexOffset,
    categories,
    samples,
    unfilteredSamples,
    displayImplementation
  );
}

/**
 * This function returns the timings for a specific path. The algorithm is
 * adjusted when the call tree is inverted.
 * Note that the unfilteredThread should be the original thread before any filtering
 * (by range or other) happens. Also sampleIndexOffset needs to be properly
 * specified and is the offset to be applied on thread's indexes to access
 * the same samples in unfilteredThread.
 */
export function getTimingsForCallNodeIndex(
  needleNodeIndex: IndexIntoCallNodeTable | null,
  { callNodeTable, stackIndexToCallNodeIndex }: CallNodeInfo,
  interval: Milliseconds,
  isInvertedTree: boolean,
  thread: Thread,
  unfilteredThread: Thread,
  sampleIndexOffset: number,
  categories: CategoryList,
  samples: SamplesLikeTable,
  unfilteredSamples: SamplesLikeTable,
  displayImplementation: boolean
): TimingsForPath {
  /* ------------ Variables definitions ------------*/

  // This is the data from the filtered thread that we'll loop over.
  const { stackTable, stringTable } = thread;

  // This is the data from the unfiltered thread that we'll use to gather
  // category and JS implementation information. Note that samples are offset by
  // `sampleIndexOffset` because of range filtering.
  const {
    stackTable: unfilteredStackTable,
    funcTable: unfilteredFuncTable,
    frameTable: unfilteredFrameTable,
  } = unfilteredThread;

  // This holds the category index for the JavaScript category, so that we can
  // use it to quickly check the category later on.
  const javascriptCategoryIndex = categories.findIndex(
    ({ name }) => name === 'JavaScript'
  );

  // This object holds the timings for the current call node path, specified by
  // needleNodeIndex.
  const pathTimings: ItemTimings = {
    selfTime: {
      value: 0,
      breakdownByImplementation: null,
      breakdownByCategory: null,
    },
    totalTime: {
      value: 0,
      breakdownByImplementation: null,
      breakdownByCategory: null,
    },
  };

  // This object holds the timings for the function (all occurrences) pointed by
  // the specified call node.
  const funcTimings: ItemTimings = {
    selfTime: {
      value: 0,
      breakdownByImplementation: null,
      breakdownByCategory: null,
    },
    totalTime: {
      value: 0,
      breakdownByImplementation: null,
      breakdownByCategory: null,
    },
  };

  // This holds the root time, it's incremented for all samples and is useful to
  // have an absolute value to compare the other values with.
  let rootTime = 0;

  /* -------- End of variable definitions ------- */

  /* ------------ Functions definitions --------- *
   * We define functions here so that they have easy access to the variables and
   * the algorithm's parameters. */

  /**
   * This function is called for native stacks. If the native stack has the
   * 'JavaScript' category, then we move up the call tree to find the nearest
   * ancestor that's JS and returns its JS implementation.
   */
  function getImplementationForNativeStack(
    unfilteredStackIndex: IndexIntoStackTable
  ): StackImplementation {
    const category = unfilteredStackTable.category[unfilteredStackIndex];
    if (category !== javascriptCategoryIndex) {
      return 'native';
    }

    for (
      let currentStackIndex = unfilteredStackIndex;
      currentStackIndex !== null;
      currentStackIndex = unfilteredStackTable.prefix[currentStackIndex]
    ) {
      const frameIndex = unfilteredStackTable.frame[currentStackIndex];
      const funcIndex = unfilteredFrameTable.func[frameIndex];
      const isJS = unfilteredFuncTable.isJS[funcIndex];
      if (isJS) {
        return getImplementationForJsStack(frameIndex);
      }
    }

    // No JS frame was found in the ancestors, this is weird but why not?
    return 'native';
  }

  /**
   * This function Returns the JS implementation information for a specific JS stack.
   */
  function getImplementationForJsStack(
    unfilteredFrameIndex: IndexIntoFrameTable
  ): JsImplementation {
    const jsImplementationStrIndex =
      unfilteredFrameTable.implementation[unfilteredFrameIndex];

    if (jsImplementationStrIndex === null) {
      return 'interpreter';
    }

    const jsImplementation = stringTable.getString(jsImplementationStrIndex);

    switch (jsImplementation) {
      case 'baseline':
      case 'blinterp':
      case 'ion':
        return jsImplementation;
      default:
        return 'unknown';
    }
  }

  function getImplementationForStack(
    thisSampleIndex: IndexIntoSamplesTable
  ): StackImplementation {
    const stackIndex =
      unfilteredSamples.stack[thisSampleIndex + sampleIndexOffset];
    if (stackIndex === null) {
      // This should not happen in the unfiltered thread.
      console.error('We got a null stack, this should not happen.');
      return 'native';
    }

    const frameIndex = unfilteredStackTable.frame[stackIndex];
    const funcIndex = unfilteredFrameTable.func[frameIndex];
    const implementation = unfilteredFuncTable.isJS[funcIndex]
      ? getImplementationForJsStack(frameIndex)
      : getImplementationForNativeStack(stackIndex);

    return implementation;
  }

  /**
   * This is a small utility function to more easily add data to breakdowns.
   * The funcIndex could be computed from the stackIndex but is provided as an
   * argument because it's been already computed when this function is called.
   */
  function accumulateDataToTimings(
    timings: {
      breakdownByImplementation: BreakdownByImplementation | null,
      breakdownByCategory: BreakdownByCategory | null,
      value: number,
    },
    sampleIndex: IndexIntoSamplesTable,
    stackIndex: IndexIntoStackTable,
    duration: Milliseconds
  ): void {
    // Step 1: increment the total value
    timings.value += duration;

    // Step 2: find the implementation value for this sample
    const implementation = getImplementationForStack(sampleIndex);

    // Step 3: increment the right value in the implementation breakdown
    if (displayImplementation) {
      if (timings.breakdownByImplementation === null) {
        timings.breakdownByImplementation = {};
      }
      if (timings.breakdownByImplementation[implementation] === undefined) {
        timings.breakdownByImplementation[implementation] = 0;
      }
      timings.breakdownByImplementation[implementation] += duration;
    } else {
      timings.breakdownByImplementation = null;
    }

    // step 4: find the category value for this stack. We want to use the
    // category of the unfilteredThread.
    const unfilteredStackIndex =
      unfilteredSamples.stack[sampleIndex + sampleIndexOffset];
    if (unfilteredStackIndex !== null) {
      const categoryIndex = unfilteredStackTable.category[unfilteredStackIndex];
      const subcategoryIndex =
        unfilteredStackTable.subcategory[unfilteredStackIndex];

      // step 5: increment the right value in the category breakdown
      if (timings.breakdownByCategory === null) {
        timings.breakdownByCategory = categories.map((category) => ({
          entireCategoryValue: 0,
          subcategoryBreakdown: Array(category.subcategories.length).fill(0),
        }));
      }
      timings.breakdownByCategory[categoryIndex].entireCategoryValue +=
        duration;
      timings.breakdownByCategory[categoryIndex].subcategoryBreakdown[
        subcategoryIndex
      ] += duration;
    }
  }
  /* ------------- End of function definitions ------------- */

  /* ------------ Start of the algorithm itself ------------ */
  if (needleNodeIndex === null) {
    // No index was provided, return empty timing information.
    return { forPath: pathTimings, forFunc: funcTimings, rootTime };
  }

  // This is the function index for this call node.
  const needleFuncIndex = callNodeTable.func[needleNodeIndex];

  // Loop over each sample and accumulate the self time, running time, and
  // the implementation breakdown.
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const thisStackIndex = samples.stack[sampleIndex];
    if (thisStackIndex === null) {
      continue;
    }

    const weight = samples.weight ? samples.weight[sampleIndex] : 1;

    rootTime += Math.abs(weight);

    const thisNodeIndex = stackIndexToCallNodeIndex[thisStackIndex];
    const thisFunc = callNodeTable.func[thisNodeIndex];

    if (!isInvertedTree) {
      // For non-inverted trees, we compute the self time from the stacks' leaf nodes.
      if (thisNodeIndex === needleNodeIndex) {
        accumulateDataToTimings(
          pathTimings.selfTime,
          sampleIndex,
          thisStackIndex,
          weight
        );
      }

      if (thisFunc === needleFuncIndex) {
        accumulateDataToTimings(
          funcTimings.selfTime,
          sampleIndex,
          thisStackIndex,
          weight
        );
      }
    }

    // Use the stackTable to traverse the call node path and get various
    // measurements.
    // We don't use getCallNodePathFromIndex because we don't need the result
    // itself, and it's costly to get. Moreover we can break out of the loop
    // early if necessary.
    let funcFound = false;
    let pathFound = false;
    let nextStackIndex;
    for (
      let currentStackIndex = thisStackIndex;
      currentStackIndex !== null;
      currentStackIndex = nextStackIndex
    ) {
      const currentNodeIndex = stackIndexToCallNodeIndex[currentStackIndex];
      const currentFuncIndex = callNodeTable.func[currentNodeIndex];
      nextStackIndex = stackTable.prefix[currentStackIndex];

      if (currentNodeIndex === needleNodeIndex) {
        // One of the parents is the exact passed path.
        // For non-inverted trees, we can contribute the data to the
        // implementation breakdown now.
        // Note that for inverted trees, we need to traverse up to the root node
        // first, see below for this.
        if (!isInvertedTree) {
          accumulateDataToTimings(
            pathTimings.totalTime,
            sampleIndex,
            thisStackIndex,
            weight
          );
        }

        pathFound = true;
      }

      if (!funcFound && currentFuncIndex === needleFuncIndex) {
        // One of the parents' func is the same function as the passed path.
        // Note we could have the same function several times in the stack, so
        // we need a boolean variable to prevent adding it more than once.
        // The boolean variable will also be used to accumulate timings for
        // inverted trees below.
        if (!isInvertedTree) {
          accumulateDataToTimings(
            funcTimings.totalTime,
            sampleIndex,
            thisStackIndex,
            weight
          );
        }
        funcFound = true;
      }

      // When the tree isn't inverted, we don't need to move further up the call
      // node if we already found all the data.
      // But for inverted trees, the selfTime is counted on the root node so we
      // need to go on looping the stack until we find it.

      if (!isInvertedTree && funcFound && pathFound) {
        // As explained above, for non-inverted trees, we can break here if we
        // found everything already.
        break;
      }

      if (isInvertedTree && nextStackIndex === null) {
        // This is an inverted tree, and we're at the root node because its
        // prefix is `null`.
        if (currentNodeIndex === needleNodeIndex) {
          // This root node matches the passed call node path.
          // This is the only place where we don't accumulate timings, mainly
          // because this would be the same as for the total time.
          pathTimings.selfTime.value += weight;
        }

        if (currentFuncIndex === needleFuncIndex) {
          // This root node is the same function as the passed call node path.
          accumulateDataToTimings(
            funcTimings.selfTime,
            sampleIndex,
            currentStackIndex,
            weight
          );
        }

        if (pathFound) {
          // We contribute the implementation information if the passed path was
          // found in this stack earlier.
          accumulateDataToTimings(
            pathTimings.totalTime,
            sampleIndex,
            currentStackIndex,
            weight
          );
        }

        if (funcFound) {
          // We contribute the implementation information if the leaf function
          // of the passed path was found in this stack earlier.
          accumulateDataToTimings(
            funcTimings.totalTime,
            sampleIndex,
            currentStackIndex,
            weight
          );
        }
      }
    }
  }

  return { forPath: pathTimings, forFunc: funcTimings, rootTime };
}

// This function computes the time range for a thread, using both its samples
// and markers data. It's memoized and exported below, because it's called both
// here in getTimeRangeIncludingAllThreads, and in selectors when dealing with
// markers.
// Because `getTimeRangeIncludingAllThreads` is called in a reducer and it's
// quite complex to change this, the memoization happens here.
// When changing the signature, please accordingly check that the map class used
// for memoization is still the right one.
function _getTimeRangeForThread(
  { samples, markers, jsAllocations, nativeAllocations }: Thread,
  interval: Milliseconds
): StartEndRange {
  const result = { start: Infinity, end: -Infinity };

  if (samples.length) {
    const lastSampleIndex = samples.length - 1;
    result.start = samples.time[0];
    result.end = samples.time[lastSampleIndex] + interval;
  } else if (markers.length) {
    // Looking at the markers only if there are no samples in the profile.
    // We need to look at those because it can be a marker only profile(no-sampling mode).
    // Finding start and end times sadly requires looping through all markers :(
    for (let i = 0; i < markers.length; i++) {
      const maybeStartTime = markers.startTime[i];
      const maybeEndTime = markers.endTime[i];
      const markerPhase = markers.phase[i];
      // The resulting range needs to adjust BOTH the start and end of the range, as
      // each marker type could adjust the total range beyond the current bounds.
      // Note the use of Math.min and Math.max are different for the start and end
      // of the markers.

      switch (markerPhase) {
        case INSTANT:
        case INTERVAL_START: {
          const startTime = ensureExists(maybeStartTime);

          result.start = Math.min(result.start, startTime);
          result.end = Math.max(result.end, startTime + interval);
          break;
        }
        case INTERVAL_END: {
          const endTime = ensureExists(maybeEndTime);

          result.start = Math.min(result.start, endTime);
          result.end = Math.max(result.end, endTime + interval);
          break;
        }
        case INTERVAL: {
          const startTime = ensureExists(maybeStartTime);
          const endTime = ensureExists(maybeEndTime);

          result.start = Math.min(result.start, startTime, endTime);
          result.end = Math.max(
            result.end,
            startTime + interval,
            endTime + interval
          );
          break;
        }
        default:
          throw new Error('Unhandled marker phase type.');
      }
    }
  }

  if (jsAllocations) {
    // For good measure, also check the allocations. This is mainly so that tests
    // will behave nicely.
    const lastIndex = jsAllocations.length - 1;
    result.start = Math.min(result.start, jsAllocations.time[0]);
    result.end = Math.max(result.end, jsAllocations.time[lastIndex] + interval);
  }

  if (nativeAllocations) {
    // For good measure, also check the allocations. This is mainly so that tests
    // will behave nicely.
    const lastIndex = nativeAllocations.length - 1;
    result.start = Math.min(result.start, nativeAllocations.time[0]);
    result.end = Math.max(
      result.end,
      nativeAllocations.time[lastIndex] + interval
    );
  }

  return result;
}

// We do a full memoization because it's called for several different threads.
// But it won't be called more than once per thread.
// Note that because MixedTupleMap internally uses a WeakMap, it should properly
// free the memory when we load another profile (for example when dealing with
// zip files).
const memoizedGetTimeRangeForThread = memoize(_getTimeRangeForThread, {
  // We use a MixedTupleMap because the function takes both primitive and
  // complex types.
  cache: new MixedTupleMap(),
});
export { memoizedGetTimeRangeForThread as getTimeRangeForThread };

export function getTimeRangeIncludingAllThreads(
  profile: Profile
): StartEndRange {
  const completeRange = { start: Infinity, end: -Infinity };
  profile.threads.forEach((thread) => {
    const threadRange = memoizedGetTimeRangeForThread(
      thread,
      profile.meta.interval
    );
    completeRange.start = Math.min(completeRange.start, threadRange.start);
    completeRange.end = Math.max(completeRange.end, threadRange.end);
  });
  return completeRange;
}

export function defaultThreadOrder(threads: Thread[]): ThreadIndex[] {
  const threadOrder = threads.map((thread, i) => i);

  // Note: to have a consistent behavior independant of the sorting algorithm,
  // we need to be careful that the comparator function is consistent:
  // comparator(a, b) === - comparator(b, a)
  // and
  // comparator(a, b) === 0   if and only if   a === b
  threadOrder.sort((a, b) => {
    const nameA = threads[a].name;
    const nameB = threads[b].name;

    if (nameA === nameB) {
      return a - b;
    }

    // Put the compositor/renderer thread last.
    // Compositor will always be before Renderer, if both are present.
    if (nameA === 'Compositor') {
      return 1;
    }

    if (nameB === 'Compositor') {
      return -1;
    }

    if (nameA === 'Renderer') {
      return 1;
    }

    if (nameB === 'Renderer') {
      return -1;
    }

    // Otherwise keep the existing order. We don't return 0 to guarantee that
    // the sort is stable even if the sort algorithm isn't.
    return a - b;
  });
  return threadOrder;
}

export function toValidImplementationFilter(
  implementation: string
): ImplementationFilter {
  switch (implementation) {
    case 'cpp':
    case 'js':
      return implementation;
    default:
      return 'combined';
  }
}

export function toValidCallTreeSummaryStrategy(
  strategy: mixed
): CallTreeSummaryStrategy {
  switch (strategy) {
    case 'timing':
    case 'js-allocations':
    case 'native-retained-allocations':
    case 'native-allocations':
    case 'native-deallocations-sites':
    case 'native-deallocations-memory':
      return strategy;
    default:
      // Default to "timing" if the strategy is not recognized. This value can come
      // from a user-generated URL.
      // e.g. `profiler.firefox.com/public/hash/ctSummary=tiiming` (note the typo.)
      // This default branch will ensure we don't send values we don't understand to
      // the store.
      return 'timing';
  }
}

export function filterThreadByImplementation(
  thread: Thread,
  implementation: string,
  defaultCategory: IndexIntoCategoryList
): Thread {
  const { funcTable, stringTable } = thread;

  switch (implementation) {
    case 'cpp':
      return _filterThreadByFunc(
        thread,
        (funcIndex) => {
          // Return quickly if this is a JS frame.
          if (funcTable.isJS[funcIndex]) {
            return false;
          }
          // Regular C++ functions are associated with a resource that describes the
          // shared library that these C++ functions were loaded from. Jitcode is not
          // loaded from shared libraries but instead generated at runtime, so Jitcode
          // frames are not associated with a shared library and thus have no resource
          const locationString = stringTable.getString(
            funcTable.name[funcIndex]
          );
          const isProbablyJitCode =
            funcTable.resource[funcIndex] === -1 &&
            locationString.startsWith('0x');
          return !isProbablyJitCode;
        },
        defaultCategory
      );
    case 'js':
      return _filterThreadByFunc(
        thread,
        (funcIndex) => {
          return (
            funcTable.isJS[funcIndex] || funcTable.relevantForJS[funcIndex]
          );
        },
        defaultCategory
      );
    default:
      return thread;
  }
}

function _filterThreadByFunc(
  thread: Thread,
  filter: (IndexIntoFuncTable) => boolean,
  defaultCategory: IndexIntoCallNodeTable
): Thread {
  return timeCode('filterThread', () => {
    const { stackTable, frameTable } = thread;

    const newStackTable = {
      length: 0,
      frame: [],
      prefix: [],
      category: [],
      subcategory: [],
    };

    const oldStackToNewStack = new Map();
    const frameCount = frameTable.length;
    const prefixStackAndFrameToStack = new Map(); // prefixNewStack * frameCount + frame => newStackIndex

    function convertStack(stackIndex) {
      if (stackIndex === null) {
        return null;
      }
      let newStack = oldStackToNewStack.get(stackIndex);
      if (newStack === undefined) {
        const prefixNewStack = convertStack(stackTable.prefix[stackIndex]);
        const frameIndex = stackTable.frame[stackIndex];
        const funcIndex = frameTable.func[frameIndex];
        if (filter(funcIndex)) {
          const prefixStackAndFrameIndex =
            (prefixNewStack === null ? -1 : prefixNewStack) * frameCount +
            frameIndex;
          newStack = prefixStackAndFrameToStack.get(prefixStackAndFrameIndex);
          if (newStack === undefined) {
            newStack = newStackTable.length++;
            newStackTable.prefix[newStack] = prefixNewStack;
            newStackTable.frame[newStack] = frameIndex;
            newStackTable.category[newStack] = stackTable.category[stackIndex];
            newStackTable.subcategory[newStack] =
              stackTable.subcategory[stackIndex];
          } else if (
            newStackTable.category[newStack] !== stackTable.category[stackIndex]
          ) {
            // Conflicting origin stack categories -> default category + subcategory.
            newStackTable.category[newStack] = defaultCategory;
            newStackTable.subcategory[newStack] = 0;
          } else if (
            newStackTable.subcategory[stackIndex] !==
            stackTable.subcategory[stackIndex]
          ) {
            // Conflicting origin stack subcategories -> "Other" subcategory.
            newStackTable.subcategory[stackIndex] = 0;
          }
          oldStackToNewStack.set(stackIndex, newStack);
          prefixStackAndFrameToStack.set(prefixStackAndFrameIndex, newStack);
        } else {
          newStack = prefixNewStack;
        }
      }
      return newStack;
    }

    return updateThreadStacks(thread, newStackTable, convertStack);
  });
}

export function filterThreadToSearchStrings(
  thread: Thread,
  searchStrings: string[] | null
): Thread {
  return timeCode('filterThreadToSearchStrings', () => {
    if (!searchStrings || !searchStrings.length) {
      return thread;
    }

    return searchStrings.reduce(filterThreadToSearchString, thread);
  });
}

export function filterThreadToSearchString(
  thread: Thread,
  searchString: string
): Thread {
  if (!searchString) {
    return thread;
  }
  const lowercaseSearchString = searchString.toLowerCase();
  const { funcTable, frameTable, stackTable, stringTable, resourceTable } =
    thread;

  function computeFuncMatchesFilter(func) {
    const nameIndex = funcTable.name[func];
    const nameString = stringTable.getString(nameIndex);
    if (nameString.toLowerCase().includes(lowercaseSearchString)) {
      return true;
    }

    const fileNameIndex = funcTable.fileName[func];
    if (fileNameIndex !== null) {
      const fileNameString = stringTable.getString(fileNameIndex);
      if (fileNameString.toLowerCase().includes(lowercaseSearchString)) {
        return true;
      }
    }

    const resourceIndex = funcTable.resource[func];
    if (resourceIndex !== -1) {
      const resourceNameIndex = resourceTable.name[resourceIndex];
      const resourceNameString = stringTable.getString(resourceNameIndex);
      if (resourceNameString.toLowerCase().includes(lowercaseSearchString)) {
        return true;
      }
    }

    return false;
  }

  const funcMatchesFilterCache = new Map();
  function funcMatchesFilter(func) {
    let result = funcMatchesFilterCache.get(func);
    if (result === undefined) {
      result = computeFuncMatchesFilter(func);
      funcMatchesFilterCache.set(func, result);
    }
    return result;
  }

  const stackMatchesFilterCache = new Map();
  function stackMatchesFilter(stackIndex) {
    if (stackIndex === null) {
      return false;
    }
    let result = stackMatchesFilterCache.get(stackIndex);
    if (result === undefined) {
      const prefix = stackTable.prefix[stackIndex];
      if (stackMatchesFilter(prefix)) {
        result = true;
      } else {
        const frame = stackTable.frame[stackIndex];
        const func = frameTable.func[frame];
        result = funcMatchesFilter(func);
      }
      stackMatchesFilterCache.set(stackIndex, result);
    }
    return result;
  }

  return updateThreadStacks(thread, stackTable, (stackIndex) =>
    stackMatchesFilter(stackIndex) ? stackIndex : null
  );
}

/**
 * We have page data(innerWindowID) inside the JS frames. Go through each sample
 * and filter out the ones that don't include any JS frame with the relevant innerWindowID.
 * Please note that it also keeps native frames if that sample has a relevant JS
 * frame in any part of the stack. Also it doesn't mutate the stack itself, only
 * nulls the stack array elements of samples object. Therefore, it doesn't
 * invalidate transforms.
 * If we don't have any item in relevantPages, returns all the samples.
 */
export function filterThreadByTab(
  thread: Thread,
  relevantPages: Set<InnerWindowID>
): Thread {
  return timeCode('filterThreadByTab', () => {
    if (relevantPages.size === 0) {
      // Either there is no relevant page or "active tab only" view is not active.
      return thread;
    }

    const { frameTable, stackTable } = thread;

    // innerWindowID array lives inside the frameTable. Check that and decide
    // if we should keep that sample or not.
    const frameMatchesFilterCache: Map<IndexIntoFrameTable, boolean> =
      new Map();
    function frameMatchesFilter(frame) {
      const cache = frameMatchesFilterCache.get(frame);
      if (cache !== undefined) {
        return cache;
      }

      const innerWindowID = frameTable.innerWindowID[frame];
      const matches =
        innerWindowID && innerWindowID > 0
          ? relevantPages.has(innerWindowID)
          : false;
      frameMatchesFilterCache.set(frame, matches);
      return matches;
    }

    // Use the stackTable to navigate to frameTable and cache the result of it.
    const stackMatchesFilterCache: Map<IndexIntoStackTable, boolean> =
      new Map();
    function stackMatchesFilter(stackIndex) {
      if (stackIndex === null) {
        return false;
      }
      const cache = stackMatchesFilterCache.get(stackIndex);
      if (cache !== undefined) {
        return cache;
      }

      const prefix = stackTable.prefix[stackIndex];
      if (stackMatchesFilter(prefix)) {
        stackMatchesFilterCache.set(stackIndex, true);
        return true;
      }

      const frame = stackTable.frame[stackIndex];
      const matches = frameMatchesFilter(frame);
      stackMatchesFilterCache.set(stackIndex, matches);
      return matches;
    }

    // Update the stack array elements of samples object and make them null if
    // they don't include any relevant JS frame.
    // It doesn't mutate the stack itself.
    return updateThreadStacks(thread, stackTable, (stackIndex) =>
      stackMatchesFilter(stackIndex) ? stackIndex : null
    );
  });
}

/**
 * This function takes both a SamplesTable and can be used on CounterSamplesTable.
 */
export function getSampleIndexRangeForSelection(
  table: { time: Milliseconds[], length: number },
  rangeStart: number,
  rangeEnd: number
): [IndexIntoSamplesTable, IndexIntoSamplesTable] {
  const sampleStart = bisectionLeft(table.time, rangeStart);
  const sampleEnd = bisectionLeft(table.time, rangeEnd, sampleStart);
  return [sampleStart, sampleEnd];
}

/**
 * This function takes a samples table and returns the sample range
 * including the sample just before and after the range. This is needed to make
 * sure that some charts will not be cut off at the edges when zoomed in to a range.
 */
export function getInclusiveSampleIndexRangeForSelection(
  table: { time: Milliseconds[], length: number },
  rangeStart: number,
  rangeEnd: number
): [IndexIntoSamplesTable, IndexIntoSamplesTable] {
  let [sampleStart, sampleEnd] = getSampleIndexRangeForSelection(
    table,
    rangeStart,
    rangeEnd
  );

  // Include the samples just before and after the selection range, so that charts will
  // not be cut off at the edges.
  if (sampleStart > 0) {
    sampleStart--;
  }
  if (sampleEnd < table.length) {
    sampleEnd++;
  }

  return [sampleStart, sampleEnd];
}

export function filterThreadSamplesToRange(
  thread: Thread,
  rangeStart: number,
  rangeEnd: number
): Thread {
  const { samples, jsAllocations, nativeAllocations } = thread;
  const [beginSampleIndex, endSampleIndex] = getSampleIndexRangeForSelection(
    samples,
    rangeStart,
    rangeEnd
  );
  const newSamples: SamplesTable = {
    length: endSampleIndex - beginSampleIndex,
    time: samples.time.slice(beginSampleIndex, endSampleIndex),
    weight: samples.weight
      ? samples.weight.slice(beginSampleIndex, endSampleIndex)
      : null,
    weightType: samples.weightType,
    stack: samples.stack.slice(beginSampleIndex, endSampleIndex),
  };

  if (samples.eventDelay) {
    newSamples.eventDelay = samples.eventDelay.slice(
      beginSampleIndex,
      endSampleIndex
    );
  } else if (samples.responsiveness) {
    newSamples.responsiveness = samples.responsiveness.slice(
      beginSampleIndex,
      endSampleIndex
    );
  }

  if (samples.threadCPUDelta) {
    newSamples.threadCPUDelta = samples.threadCPUDelta.slice(
      beginSampleIndex,
      endSampleIndex
    );
  }

  if (samples.threadId) {
    newSamples.threadId = samples.threadId.slice(
      beginSampleIndex,
      endSampleIndex
    );
  }

  const newThread: Thread = {
    ...thread,
    samples: newSamples,
  };

  if (jsAllocations) {
    const [startAllocIndex, endAllocIndex] = getSampleIndexRangeForSelection(
      jsAllocations,
      rangeStart,
      rangeEnd
    );
    newThread.jsAllocations = {
      time: jsAllocations.time.slice(startAllocIndex, endAllocIndex),
      className: jsAllocations.className.slice(startAllocIndex, endAllocIndex),
      typeName: jsAllocations.typeName.slice(startAllocIndex, endAllocIndex),
      coarseType: jsAllocations.coarseType.slice(
        startAllocIndex,
        endAllocIndex
      ),
      weight: jsAllocations.weight.slice(startAllocIndex, endAllocIndex),
      weightType: jsAllocations.weightType,
      inNursery: jsAllocations.inNursery.slice(startAllocIndex, endAllocIndex),
      stack: jsAllocations.stack.slice(startAllocIndex, endAllocIndex),
      length: endAllocIndex - startAllocIndex,
    };
  }

  if (nativeAllocations) {
    const [startAllocIndex, endAllocIndex] = getSampleIndexRangeForSelection(
      nativeAllocations,
      rangeStart,
      rangeEnd
    );
    const time = nativeAllocations.time.slice(startAllocIndex, endAllocIndex);
    const weight = nativeAllocations.weight.slice(
      startAllocIndex,
      endAllocIndex
    );
    const stack = nativeAllocations.stack.slice(startAllocIndex, endAllocIndex);
    const length = endAllocIndex - startAllocIndex;
    if (nativeAllocations.memoryAddress) {
      newThread.nativeAllocations = {
        time,
        weight,
        weightType: nativeAllocations.weightType,
        stack,
        memoryAddress: nativeAllocations.memoryAddress.slice(
          startAllocIndex,
          endAllocIndex
        ),
        threadId: nativeAllocations.threadId.slice(
          startAllocIndex,
          endAllocIndex
        ),
        length,
      };
    } else {
      newThread.nativeAllocations = {
        time,
        weight,
        weightType: nativeAllocations.weightType,
        stack,
        length,
      };
    }
  }

  return newThread;
}

/**
 * Filter the counter samples to the given range by iterating all of their sample groups.
 */
export function filterCounterSamplesToRange(
  counter: Counter,
  rangeStart: number,
  rangeEnd: number
): Counter {
  const newCounter = { ...counter };
  newCounter.sampleGroups = [...newCounter.sampleGroups];
  const { sampleGroups } = newCounter;

  for (
    let sampleGroupIdx = 0;
    sampleGroupIdx < sampleGroups.length;
    sampleGroupIdx++
  ) {
    sampleGroups[sampleGroupIdx] = { ...sampleGroups[sampleGroupIdx] };
    const sampleGroup = sampleGroups[sampleGroupIdx];
    // Intentionally get the inclusive sample indexes with this one instead of
    // getSampleIndexRangeForSelection because graphs like memory graph requires
    // one sample before and after to be in the sample range so the graph doesn't
    // look cut off.
    const [beginSampleIndex, endSampleIndex] =
      getInclusiveSampleIndexRangeForSelection(
        sampleGroup.samples,
        rangeStart,
        rangeEnd
      );

    sampleGroup.samples = {
      length: endSampleIndex - beginSampleIndex,
      time: sampleGroup.samples.time.slice(beginSampleIndex, endSampleIndex),
      count: sampleGroup.samples.count.slice(beginSampleIndex, endSampleIndex),
      number: sampleGroup.samples.number
        ? sampleGroup.samples.number.slice(beginSampleIndex, endSampleIndex)
        : undefined,
    };
  }

  return newCounter;
}

/**
 * Process the samples in the counter sample groups.
 */
export function processCounter(counter: Counter): Counter {
  const processedGroups = counter.sampleGroups.map((sampleGroup) => {
    const { samples } = sampleGroup;
    const count = samples.count.slice();
    const number =
      samples.number !== undefined ? samples.number.slice() : undefined;

    // These lines zero out the first values of the counters, as they are unreliable. In
    // addition, there are probably some missed counts in the memory counters, so the
    // first memory number slowly creeps up over time, and becomes very unrealistic.
    // In order to not be affected by these platform limitations, zero out the first
    // counter values.
    //
    // "Memory counter in Gecko Profiler isn't cleared when starting a new capture"
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1520587
    count[0] = 0;
    if (number !== undefined) {
      number[0] = 0;
    }

    return {
      ...sampleGroup,
      samples: {
        ...samples,
        number,
        count,
      },
    };
  });

  return {
    ...counter,
    sampleGroups: processedGroups,
  };
}

/**
 * The memory counter contains relative offsets of memory. In order to draw an interesting
 * graph, take the memory counts, and find the minimum and maximum values, by
 * accumulating them over the entire profile range. Then, map those values to the
 * accumulatedCounts array.
 */
export function accumulateCounterSamples(
  samplesArray: Array<CounterSamplesTable>,
  sampleRanges?: Array<[IndexIntoSamplesTable, IndexIntoSamplesTable]>
): Array<AccumulatedCounterSamples> {
  const accumulatedSamples = samplesArray.map((samples, index) => {
    let minCount = 0;
    let maxCount = 0;
    let accumulated = 0;
    const accumulatedCounts = Array(samples.length).fill(0);
    // If a range is provided, use it instead. This will also include the
    // samples right before and after the range.
    const startSampleIndex =
      sampleRanges && sampleRanges[index] ? sampleRanges[index][0] : 0;
    const endSampleIndex =
      sampleRanges && sampleRanges[index]
        ? sampleRanges[index][1]
        : samples.length;

    for (let i = startSampleIndex; i < endSampleIndex; i++) {
      accumulated += samples.count[i];
      minCount = Math.min(accumulated, minCount);
      maxCount = Math.max(accumulated, maxCount);
      accumulatedCounts[i] = accumulated;
    }
    const countRange = maxCount - minCount;

    return {
      minCount,
      maxCount,
      countRange,
      accumulatedCounts,
    };
  });

  return accumulatedSamples;
}

/**
 * Compute the max counter sample counts per milliseconds to determine the range
 * of a counter.
 * If a start-end range is provided, it only computes the max value between that
 * range.
 */
export function computeMaxCounterSampleCountsPerMs(
  samplesArray: Array<CounterSamplesTable>,
  profileInterval: Milliseconds,
  sampleRanges?: Array<[IndexIntoSamplesTable, IndexIntoSamplesTable]>
): Array<number> {
  const maxSampleCounts = samplesArray.map((samples, index) => {
    let maxCount = 0;
    // If a range is provided, use it instead. This will also include the
    // samples right before and after the range.
    const startSampleIndex =
      sampleRanges && sampleRanges[index] ? sampleRanges[index][0] : 0;
    const endSampleIndex =
      sampleRanges && sampleRanges[index]
        ? sampleRanges[index][1]
        : samples.length;

    for (let i = startSampleIndex; i < endSampleIndex; i++) {
      const count = samples.count[i];
      const sampleTimeDeltaInMs =
        i === 0 ? profileInterval : samples.time[i] - samples.time[i - 1];
      const countPerMs = count / sampleTimeDeltaInMs;
      maxCount = Math.max(countPerMs, maxCount);
    }

    return maxCount;
  });

  return maxSampleCounts;
}

/**
 * Pre-processing of raw eventDelay values.
 *
 * We don't do 16ms event injection for responsiveness values anymore. Instead,
 * profiler records the time since running event blocked the input events. But
 * this value is not enough to calculate event delays by itself. We need to process
 * these values and turn them into event delays, which we can use for determining
 * responsiveness later.
 *
 * For every event that gets enqueued, the delay time will go up by the event's
 * running time at the time at which the event is enqueued. The delay function
 * will be a sawtooth of the following shape:
 *
 *              |\           |...
 *              | \          |
 *         |\   |  \         |
 *         | \  |   \        |
 *      |\ |  \ |    \       |
 *   |\ | \|   \|     \      |
 *   | \|              \     |
 *  _|                  \____|
 *
 * Calculate the delay of a new event added at time t: (run every sample)
 *
 *  TimeSinceRunningEventBlockedInputEvents = RunningEventDelay + (now - RunningEventStart);
 *  effective_submission = now - TimeSinceRunningEventBlockedInputEvents;
 *  delta = (now - last_sample_time);
 *  last_sample_time = now;
 *  for (t=effective_submission to now) {
 *     delay[t] += delta;
 *  }
 *
 * Note that TimeSinceRunningEventBlockedInputEvents is our eventDelay values in
 * the profile. So we don't have to calculate this. It's calculated in the gecko side already.
 *
 * This first algorithm is not efficient because we are running this loop for each sample.
 * Instead it can be reduced in overhead by:
 *
 *  TimeSinceRunningEventBlockedInputEvents = RunningEventDelay + (now - RunningEventStart);
 *  effective_submission = now - TimeSinceRunningEventBlockedInputEvents;
 *  if (effective_submission != last_submission) {
 *    delta = (now - last_submission);
 *    // this loop should be made to match each sample point in the range
 *    // intead of assuming 1ms sampling as this pseudocode does
 *    for (t=last_submission to effective_submission-1) {
 *       delay[t] += delta;
 *       delta -= 1; // assumes 1ms; adjust as needed to match for()
 *    }
 *    last_submission = effective_submission;
 *  }
 *
 * In this algorithm, we are running this only if effective submission is changed.
 * This reduces the calculation overhead a lot.
 * So we used the second algorithm in this function to make it faster.
 *
 * For instance the processed eventDelay values will be something like this:
 *
 *   [12 , 3, 42, 31, 22, 10, 3, 71, 65, 42, 23, 3, 33, 25, 5, 3]
 *         |___|              |___|              |___|
 *     A new event is    New event is enqueued   New event is enqueued
 *     enqueued
 *
 * A more realistic and minimal example:
 *  Unprocessed values
 *
 *   [0, 0, 1, 0, 0, 0, 0, 1, 2, 3, 4, 5, 0, 0, 0, 0]
 *          ^last submission           ^ effective submission
 *
 *  Will be converted to:
 *
 *   [0, 0, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]
 *
 * If you want to learn more about this eventDelay value on gecko side, see:
 * https://searchfox.org/mozilla-central/rev/3811b11b5773c1dccfe8228bfc7143b10a9a2a99/tools/profiler/core/platform.cpp#3000-3186
 */
export function processEventDelays(
  samples: SamplesTable,
  interval: Milliseconds
): EventDelayInfo {
  if (!samples.eventDelay) {
    throw new Error(
      'processEventDelays step should not be called for older profiles'
    );
  }

  const eventDelays = new Float32Array(samples.length);
  const rawEventDelays = ensureExists(
    samples.eventDelay,
    'eventDelays field is not present in this profile'
  );
  let lastSubmission = samples.time[0];
  let lastSubmissionIdx = 0;

  // Skipping the first element because we don't have any sample of its past.
  for (let i = 1; i < samples.length; i++) {
    const currentEventDelay = rawEventDelays[i];
    const nextEventDelay = rawEventDelays[i + 1] || 0; // it can be null or undefined (for the last element)
    const now = samples.time[i];
    if (currentEventDelay === null || currentEventDelay === undefined) {
      // Ignore anything that's not numeric. This can happen if there is no responsiveness
      // information, or if the sampler failed to collect a responsiveness value. This
      // can happen intermittently.
      //
      // See Bug 1506226.
      continue;
    }

    if (currentEventDelay < nextEventDelay) {
      // The submission is still ongoing, we should get the next event delay
      // value until the submission ends.
      continue;
    }

    // This is a new submission
    const sampleSinceBlockedEvents = Math.trunc(currentEventDelay / interval);
    const effectiveSubmission = now - currentEventDelay;
    const effectiveSubmissionIdx = i - sampleSinceBlockedEvents;

    if (effectiveSubmissionIdx < 0) {
      // Unfortunately submissions that were started before the profiler start
      // time are not reliable because we don't have any sample data for earlier.
      // Skipping it.
      lastSubmission = now;
      lastSubmissionIdx = i;
      continue;
    }

    if (lastSubmissionIdx === effectiveSubmissionIdx) {
      // Bail out early since there is nothing to do.
      lastSubmission = effectiveSubmission;
      lastSubmissionIdx = effectiveSubmissionIdx;
      continue;
    }

    let delta = now - lastSubmission;
    for (let j = lastSubmissionIdx + 1; j <= effectiveSubmissionIdx; j++) {
      eventDelays[j] += delta;
      delta -= samples.time[j + 1] - samples.time[j];
    }

    lastSubmission = effectiveSubmission;
    lastSubmissionIdx = effectiveSubmissionIdx;
  }

  // We are done with processing the delays.
  // Calculate min/max delay and delay range
  let minDelay = Number.MAX_SAFE_INTEGER;
  let maxDelay = 0;
  for (const delay of eventDelays) {
    if (delay) {
      minDelay = Math.min(delay, minDelay);
      maxDelay = Math.max(delay, maxDelay);
    }
  }
  const delayRange = maxDelay - minDelay;

  return {
    eventDelays,
    minDelay,
    maxDelay,
    delayRange,
  };
}

// --------------- CallNodePath and CallNodeIndex manipulations ---------------

// Returns a list of CallNodeIndex from CallNodePaths. This function uses a map
// to speed up the look-up process.
export function getCallNodeIndicesFromPaths(
  callNodePaths: CallNodePath[],
  callNodeTable: CallNodeTable
): Array<IndexIntoCallNodeTable | null> {
  // This is a Map<CallNodePathHash, IndexIntoCallNodeTable>. This map speeds up
  // the look-up process by caching every CallNodePath we handle which avoids
  // looking up parents again and again.
  const cache = new Map();
  return callNodePaths.map((path) =>
    _getCallNodeIndexFromPathWithCache(path, callNodeTable, cache)
  );
}

// Returns a CallNodeIndex from a CallNodePath, using and contributing to the
// cache parameter.
function _getCallNodeIndexFromPathWithCache(
  callNodePath: CallNodePath,
  callNodeTable: CallNodeTable,
  cache: Map<string, IndexIntoCallNodeTable>
): IndexIntoCallNodeTable | null {
  const hashFullPath = hashPath(callNodePath);
  const result = cache.get(hashFullPath);
  if (result !== undefined) {
    // The cache already has the result for the full path.
    return result;
  }

  // This array serves as a map and stores the hashes of callNodePath's
  // parents to speed up the algorithm. First we'll follow the tree from the
  // bottom towards the top, pushing hashes as we compute them, and then we'll
  // move back towards the bottom popping hashes from this array.
  const sliceHashes = [hashFullPath];

  // Step 1: find whether we already computed the index for one of the path's
  // parents, starting from the closest parent and looping towards the "top" of
  // the tree.
  // If we find it for one of the parents, we'll be able to start at this point
  // in the following look up.
  let i = callNodePath.length;
  let index;
  while (--i > 0) {
    // Looking up each parent for this call node, starting from the deepest node.
    // If we find a parent this makes it possible to start the look up from this location.
    const subPath = callNodePath.slice(0, i);
    const hash = hashPath(subPath);
    index = cache.get(hash);
    if (index !== undefined) {
      // Yay, we already have the result for a parent!
      break;
    }
    // Cache the hashed value because we'll need it later, after resolving this path.
    // Note we don't add the hash if we found the parent in the cache, so the
    // last added element here will accordingly be the first popped in the next
    // algorithm.
    sliceHashes.push(hash);
  }

  // Step 2: look for the requested path using the call node table, starting at
  // the parent we already know if we found one, and looping down the tree.
  // We're contributing to the cache at the same time.

  // `index` is undefined if no parent was found in the cache. In that case we
  // start from the start, and use `-1` which is the prefix we use to indicate
  // the root node.
  if (index === undefined) {
    index = -1;
  }

  while (i < callNodePath.length) {
    // Resolving the index for subpath `callNodePath.slice(0, i+1)` given we
    // know the index for the subpath `callNodePath.slice(0, i)` (its parent).
    const func = callNodePath[i];
    const nextNodeIndex = getCallNodeIndexFromParentAndFunc(
      index,
      func,
      callNodeTable
    );

    // We couldn't find this path into the call node table. This shouldn't
    // normally happen.
    if (nextNodeIndex === null) {
      return null;
    }

    // Contributing to the shared cache
    const hash = sliceHashes.pop();
    cache.set(hash, nextNodeIndex);

    index = nextNodeIndex;
    i++;
  }

  return index < 0 ? null : index;
}

// Returns the CallNodeIndex that matches the function `func` and whose parent's
// CallNodeIndex is `parent`.
export function getCallNodeIndexFromParentAndFunc(
  parent: IndexIntoCallNodeTable,
  func: IndexIntoFuncTable,
  callNodeTable: CallNodeTable
): IndexIntoCallNodeTable | null {
  // Node children always come after their parents in the call node table,
  // that's why we start looping at `parent + 1`.
  // Note that because the root parent is `-1`, we correctly start at `0` when
  // we look for a top-level item.
  for (
    let callNodeIndex = parent + 1; // the root parent is -1
    callNodeIndex < callNodeTable.length;
    callNodeIndex++
  ) {
    if (
      callNodeTable.prefix[callNodeIndex] === parent &&
      callNodeTable.func[callNodeIndex] === func
    ) {
      return callNodeIndex;
    }
  }

  return null;
}

// This function returns a CallNodeIndex from a CallNodePath, using the
// specified `callNodeTable`.
export function getCallNodeIndexFromPath(
  callNodePath: CallNodePath,
  callNodeTable: CallNodeTable
): IndexIntoCallNodeTable | null {
  const [result] = getCallNodeIndicesFromPaths([callNodePath], callNodeTable);
  return result;
}

// This function returns a CallNodePath from a CallNodeIndex.
export function getCallNodePathFromIndex(
  callNodeIndex: IndexIntoCallNodeTable | null,
  callNodeTable: CallNodeTable
): CallNodePath {
  if (callNodeIndex === null || callNodeIndex === -1) {
    return [];
  }

  const callNodePath = [];
  let fs = callNodeIndex;
  while (fs !== -1) {
    callNodePath.push(callNodeTable.func[fs]);
    fs = callNodeTable.prefix[fs];
  }
  callNodePath.reverse();
  return callNodePath;
}

/**
 * This function converts a stack information into a call node and
 * category path structure.
 */
export function convertStackToCallNodeAndCategoryPath(
  thread: Thread,
  stack: IndexIntoStackTable
): CallNodeAndCategoryPath {
  const { stackTable, frameTable } = thread;
  const path = [];
  for (
    let stackIndex = stack;
    stackIndex !== null;
    stackIndex = stackTable.prefix[stackIndex]
  ) {
    const index = stackTable.frame[stackIndex];
    path.push({
      category: stackTable.category[stackIndex],
      func: frameTable.func[index],
    });
  }
  return path.reverse();
}

/**
 * Compute maximum depth of call stack for a given thread.
 *
 * Returns the depth of the deepest call node, but with a one-based
 * depth instead of a zero-based.
 *
 * If there are no samples, or the stacks are all filtered out for the samples, then
 * 0 is returned.
 */
export function computeCallNodeMaxDepth(
  samples: SamplesLikeTable,
  callNodeInfo: CallNodeInfo
): number {
  // Compute the depth on a per-sample basis. This is done since the callNodeInfo is
  // computed for the filtered thread, but a samples-like table can use the preview
  // filtered thread, which involves a subset of the total call nodes.
  let max = -1;
  const { callNodeTable, stackIndexToCallNodeIndex } = callNodeInfo;
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const stackIndex = samples.stack[sampleIndex];
    if (stackIndex === null) {
      continue;
    }
    const callNodeIndex = stackIndexToCallNodeIndex[stackIndex];
    const depth = callNodeTable.depth[callNodeIndex];
    max = Math.max(max, depth);
  }

  return max + 1;
}

export function invertCallstack(
  thread: Thread,
  defaultCategory: IndexIntoCategoryList
): Thread {
  return timeCode('invertCallstack', () => {
    const { stackTable, frameTable } = thread;

    const newStackTable = {
      length: 0,
      frame: [],
      category: [],
      subcategory: [],
      prefix: [],
    };
    // Create a Map that keys off of two values, both the prefix and frame combination
    // by using a bit of math: prefix * frameCount + frame => stackIndex
    const prefixAndFrameToStack = new Map();
    const frameCount = frameTable.length;

    // Returns the stackIndex for a specific frame (that is, a function and its
    // context), and a specific prefix. If it doesn't exist yet it will create
    // a new stack entry and return its index.
    function stackFor(prefix, frame, category, subcategory) {
      const prefixAndFrameIndex =
        (prefix === null ? -1 : prefix) * frameCount + frame;
      let stackIndex = prefixAndFrameToStack.get(prefixAndFrameIndex);
      if (stackIndex === undefined) {
        stackIndex = newStackTable.length++;
        newStackTable.prefix[stackIndex] = prefix;
        newStackTable.frame[stackIndex] = frame;
        newStackTable.category[stackIndex] = category;
        newStackTable.subcategory[stackIndex] = subcategory;
        prefixAndFrameToStack.set(prefixAndFrameIndex, stackIndex);
      } else if (newStackTable.category[stackIndex] !== category) {
        // If two stack nodes from the non-inverted stack tree with different
        // categories happen to collapse into the same stack node in the
        // inverted tree, discard their category and set the category to the
        // default category.
        newStackTable.category[stackIndex] = defaultCategory;
        newStackTable.subcategory[stackIndex] = 0;
      } else if (newStackTable.subcategory[stackIndex] !== subcategory) {
        // If two stack nodes from the non-inverted stack tree with the same
        // category but different subcategories happen to collapse into the same
        // stack node in the inverted tree, discard their subcategory and set it
        // to the "Other" subcategory.
        newStackTable.subcategory[stackIndex] = 0;
      }
      return stackIndex;
    }

    const oldStackToNewStack = new Map();

    // For one specific stack, this will ensure that stacks are created for all
    // of its ancestors, by walking its prefix chain up to the root.
    function convertStack(stackIndex) {
      if (stackIndex === null) {
        return null;
      }
      let newStack = oldStackToNewStack.get(stackIndex);
      if (newStack === undefined) {
        newStack = null;
        for (
          let currentStack = stackIndex;
          currentStack !== null;
          currentStack = stackTable.prefix[currentStack]
        ) {
          // Notice how we reuse the previous stack as the prefix. This is what
          // effectively inverts the call tree.
          newStack = stackFor(
            newStack,
            stackTable.frame[currentStack],
            stackTable.category[currentStack],
            stackTable.subcategory[currentStack]
          );
        }
        oldStackToNewStack.set(stackIndex, newStack);
      }
      return newStack;
    }

    return updateThreadStacks(thread, newStackTable, convertStack);
  });
}

/**
 * Sometimes we want to update the stacks for a thread, for instance while searching
 * for a text string, or doing a call tree transformation. This function abstracts
 * out the manipulation of the data structures so that we can properly update
 * the stack table and any possible allocation information.
 */
export function updateThreadStacks(
  thread: Thread,
  newStackTable: StackTable,
  convertStack: (IndexIntoStackTable | null) => IndexIntoStackTable | null
): Thread {
  const { jsAllocations, nativeAllocations, samples } = thread;

  const newSamples = {
    ...samples,
    stack: samples.stack.map((oldStack) => convertStack(oldStack)),
  };

  const newThread = {
    ...thread,
    samples: newSamples,
    stackTable: newStackTable,
  };

  if (jsAllocations) {
    newThread.jsAllocations = {
      ...jsAllocations,
      stack: jsAllocations.stack.map((oldStack) => convertStack(oldStack)),
    };
  }
  if (nativeAllocations) {
    newThread.nativeAllocations = {
      ...nativeAllocations,
      stack: nativeAllocations.stack.map((oldStack) => convertStack(oldStack)),
    };
  }

  return newThread;
}

/**
 * When manipulating stack tables, the most common operation is to map from one
 * stack to a new stack using a Map. This function returns another function that
 * does this work. It is used in conjunction with updateThreadStacks().
 */
export function getMapStackUpdater(
  oldStackToNewStack: Map<
    null | IndexIntoStackTable,
    null | IndexIntoStackTable
  >
): (IndexIntoStackTable | null) => IndexIntoStackTable | null {
  return (oldStack: IndexIntoStackTable | null) => {
    if (oldStack === null) {
      return null;
    }
    const newStack = oldStackToNewStack.get(oldStack);
    if (newStack === undefined) {
      throw new Error(
        'Could not find a stack when converting from an old stack to new stack.'
      );
    }
    return newStack;
  };
}

export function getSampleIndexClosestToStartTime(
  samples: SamplesTable,
  time: number,
  interval: Milliseconds
): IndexIntoSamplesTable {
  // Bisect to find the index of the first sample after the provided time.
  const index = bisectionRight(samples.time, time);

  if (index === 0) {
    return 0;
  }

  if (index === samples.length) {
    return samples.length - 1;
  }

  // Check the distance between the provided time and the center of the bisected sample
  // and its predecessor.
  const previousIndex = index - 1;

  let weight = interval;
  let previousWeight = interval;
  if (samples.weight) {
    const samplesWeight = samples.weight;
    weight = Math.abs(samplesWeight[index]);
    previousWeight = Math.abs(samplesWeight[previousIndex]);
  }

  const distanceToThis = samples.time[index] + weight / 2 - time;
  const distanceToLast =
    time - (samples.time[previousIndex] + previousWeight / 2);
  return distanceToThis < distanceToLast ? index : index - 1;
}

/*
 * Returns the sample index that is closest to *adjusted* sample time. This is a
 * very similar function to getSampleIndexClosestToStartTime. The difference is that
 * the other function uses the raw time values, on the other hand, this function
 * uses the adjusted time. In this context, adjusted time means that `time` array
 * represent the "center" of the sample, and raw values represent the "start" of
 * the sample.
 */
export function getSampleIndexClosestToCenteredTime(
  samples: SamplesTable,
  time: number
): IndexIntoSamplesTable {
  // Bisect to find the index of the first sample after the provided time.
  const index = bisectionRight(samples.time, time);

  if (index === 0) {
    return 0;
  }

  if (index === samples.length) {
    return samples.length - 1;
  }

  // Check the distance between the provided time and the center of the bisected sample
  // and its predecessor.
  const previousIndex = index - 1;
  let distanceToThis;
  let distanceToLast;

  if (samples.weight) {
    const samplesWeight = samples.weight;
    const weight = Math.abs(samplesWeight[index]);
    const previousWeight = Math.abs(samplesWeight[previousIndex]);

    distanceToThis = samples.time[index] + weight / 2 - time;
    distanceToLast = time - (samples.time[previousIndex] + previousWeight / 2);
  } else {
    distanceToThis = samples.time[index] - time;
    distanceToLast = time - samples.time[previousIndex];
  }

  return distanceToThis < distanceToLast ? index : index - 1;
}

export function getFriendlyThreadName(
  threads: Thread[],
  thread: Thread
): string {
  let label;
  let homonymThreads;

  switch (thread.name) {
    case 'GeckoMain': {
      if (thread['eTLD+1']) {
        // Use the site name if it's provided by the back-end and it's not sanitized.
        label = thread['eTLD+1'];
        homonymThreads = threads.filter((thread) => {
          return thread.name === 'GeckoMain' && thread['eTLD+1'] === label;
        });
      } else if (thread.processName) {
        // If processName is present, use that as it should contain a friendly name.
        // We want to use that for the GeckoMain thread because it is shown as the
        // root of other threads in each process group.
        label = thread.processName;
        homonymThreads = threads.filter((thread) => {
          return thread.name === 'GeckoMain' && thread.processName === label;
        });
      } else {
        switch (thread.processType) {
          case 'default':
            label = 'Parent Process';
            break;
          case 'gpu':
            label = 'GPU Process';
            break;
          case 'rdd':
            label = 'Remote Data Decoder';
            break;
          case 'tab': {
            label = 'Content Process';
            homonymThreads = threads.filter((thread) => {
              return (
                thread.name === 'GeckoMain' && thread.processType === 'tab'
              );
            });
            break;
          }
          case 'plugin':
            label = 'Plugin Process';
            break;
          case 'socket':
            label = 'Socket Process';
            break;
          default:
          // should we throw here ?
        }
      }
      break;
    }
    default:
  }

  if (!label) {
    label = thread.name;
  }

  // Check if homonymThreads are provided and append "(index/total)" numbers to
  // the label if that's the case.
  if (homonymThreads && homonymThreads.length > 1) {
    const index = 1 + homonymThreads.indexOf(thread);
    label += ` (${index}/${homonymThreads.length})`;
  }

  return label;
}

export function getThreadProcessDetails(
  thread: Thread,
  friendlyThreadName: string
): string {
  let label = `${friendlyThreadName}\n`;
  label += `Thread: "${thread.name}"`;
  if (thread.tid !== undefined) {
    label += ` (${thread.tid})`;
  }

  if (thread.processType) {
    label += `\nProcess: "${thread.processType}"`;
    if (thread.pid !== undefined) {
      label += ` (${thread.pid})`;
    }
  }

  if (thread.isPrivateBrowsing) {
    label += '\nPrivate Browsing: Yes';
  }

  if (thread.userContextId) {
    // If present and non-zero, this page was loaded inside a container.
    label += `\nContainer Id: ${thread.userContextId}`;
  }

  return label;
}

// Determines which information to show in the "origin annotation" if both an
// origin name and a filename are present.
// A return value of true means "show both", false means "only show filename."
function _shouldShowBothOriginAndFileName(
  fileName: string,
  origin: string,
  resourceType: resourceTypeEnum | null
): boolean {
  // If the origin string is just a URL prefix that's part of the
  // filename, it doesn't add any useful information, so only show
  // the filename.
  if (fileName.startsWith(origin)) {
    return false;
  }

  // For native code (resource type "library"), if we have the filename of the
  // source code, only show the filename and not the library name.
  if (resourceType === resourceTypes.library) {
    return false;
  }

  // If the resource is something else (e.g., an extension), show origin and filename.
  return true;
}

/**
 * This function returns the source origin for a function. This can be:
 * - a filename (javascript or object file or c++ source file)
 * - a URL (if the source is a website)
 */
export function getOriginAnnotationForFunc(
  funcIndex: IndexIntoFuncTable,
  funcTable: FuncTable,
  resourceTable: ResourceTable,
  stringTable: UniqueStringArray
): string {
  let resourceType = null;
  let origin = null;
  const resourceIndex = funcTable.resource[funcIndex];
  if (resourceIndex !== -1) {
    resourceType = resourceTable.type[resourceIndex];
    const resourceNameIndex = resourceTable.name[resourceIndex];
    origin = stringTable.getString(resourceNameIndex);
  }

  const fileNameIndex = funcTable.fileName[funcIndex];
  let fileName;
  if (fileNameIndex !== null) {
    fileName = stringTable.getString(fileNameIndex);

    // Strip off any filename decorations from symbolication.
    fileName = parseFileNameFromSymbolication(fileName).path;

    const lineNumber = funcTable.lineNumber[funcIndex];
    if (lineNumber !== null) {
      fileName += ':' + lineNumber;
      const columnNumber = funcTable.columnNumber[funcIndex];
      if (columnNumber !== null) {
        fileName += ':' + columnNumber;
      }
    }
  }

  if (fileName) {
    if (
      origin &&
      _shouldShowBothOriginAndFileName(fileName, origin, resourceType)
    ) {
      return `${origin}: ${fileName}`;
    }
    return fileName;
  }

  if (origin) {
    return origin;
  }

  return '';
}

/**
 * From a valid call node path, this function returns a list of information
 * about each function in this path: their names and their origins.
 */
export function getFuncNamesAndOriginsForPath(
  path: CallNodeAndCategoryPath,
  thread: Thread
): Array<{
  funcName: string,
  category: IndexIntoCategoryList,
  isFrameLabel: boolean,
  origin: string,
}> {
  const { funcTable, stringTable, resourceTable } = thread;

  return path.map((frame) => {
    const { category, func } = frame;
    return {
      funcName: stringTable.getString(funcTable.name[func]),
      category: category,
      isFrameLabel: funcTable.resource[func] === -1,
      origin: getOriginAnnotationForFunc(
        func,
        funcTable,
        resourceTable,
        stringTable
      ),
    };
  });
}

/**
 * Return a function that can compare two samples' call nodes, and determine a sort order.
 *
 * The order is determined as follows:
 *  - Ancestor call nodes are ordered before their descendants.
 *  - Sibling call nodes are ordered by their call node index.
 * This order can be different than the order of the rows that are displayed in the
 * call tree, because it does not take any sample information into account. This
 * makes it independent of any range selection and cheaper to compute.
 */
export function getTreeOrderComparator(
  callNodeTable: CallNodeTable,
  sampleCallNodes: Array<IndexIntoCallNodeTable | null>
): (IndexIntoSamplesTable, IndexIntoSamplesTable) => number {
  /**
   * Determine the ordering of two non-null call nodes.
   */
  function compareCallNodes(
    callNodeA: IndexIntoCallNodeTable,
    callNodeB: IndexIntoCallNodeTable
  ): number {
    const initialDepthA = callNodeTable.depth[callNodeA];
    const initialDepthB = callNodeTable.depth[callNodeB];
    let depthA = initialDepthA;
    let depthB = initialDepthB;

    // Walk call tree towards the roots until the call nodes are at the same depth.
    while (depthA > depthB) {
      callNodeA = callNodeTable.prefix[callNodeA];
      depthA--;
    }
    while (depthB > depthA) {
      callNodeB = callNodeTable.prefix[callNodeB];
      depthB--;
    }

    // Sort the call nodes by the initial depth.
    if (callNodeA === callNodeB) {
      return initialDepthA - initialDepthB;
    }

    // The call nodes are at the same depth, walk towards the roots until a match is
    // is found, then sort them based on stack order.
    while (true) {
      const parentNodeA = callNodeTable.prefix[callNodeA];
      const parentNodeB = callNodeTable.prefix[callNodeB];
      if (parentNodeA === parentNodeB) {
        break;
      }
      callNodeA = parentNodeA;
      callNodeB = parentNodeB;
    }

    return callNodeA - callNodeB;
  }

  /**
   * Determine the ordering of (possibly null) call nodes for two given samples.
   * Returns a value < 0 if sampleA is ordered before sampleB,
   *                 > 0 if sampleA is ordered after sampleB,
   *                == 0 if there is no ordering between sampleA and sampleB.
   * Samples which are filtered out, i.e. for which sampleCallNodes[sample] is
   * null, are ordered *after* samples which are not filtered out.
   */
  return function treeOrderComparator(
    sampleA: IndexIntoSamplesTable,
    sampleB: IndexIntoSamplesTable
  ): number {
    const callNodeA = sampleCallNodes[sampleA];
    const callNodeB = sampleCallNodes[sampleB];

    if (callNodeA === null) {
      if (callNodeB === null) {
        // Both samples are filtered out
        return 0;
      }
      // A filtered out, B not filtered out. A goes after B.
      return 1;
    }
    if (callNodeB === null) {
      // B filtered out, A not filtered out. B goes after A.
      return -1;
    }
    return compareCallNodes(callNodeA, callNodeB);
  };
}

export function getFriendlyStackTypeName(
  implementation: StackImplementation
): string {
  switch (implementation) {
    case 'interpreter':
      return 'JS interpreter';
    case 'blinterp':
    case 'baseline':
    case 'ion':
      return `JS JIT (${implementation})`;
    case 'native':
      return 'Native code';
    case 'unknown':
      return implementation;
    default:
      throw assertExhaustiveCheck(implementation);
  }
}

export function shouldDisplaySubcategoryInfoForCategory(
  category: Category
): boolean {
  // The first subcategory of every category is the "Other" subcategory.
  // For categories which only have the "Other" subcategory and no other
  // subcategories, don't display any subcategory information.
  return category.subcategories.length > 1;
}

/** Interprets sub category 0 as the category itself */
export function getCategoryPairLabel(
  categories: CategoryList,
  categoryIndex: number,
  subcategoryIndex: number
): string {
 
  const category = categories[categoryIndex];
  let res =  subcategoryIndex !== 0
    ? `${category.name}: ${category.subcategories[subcategoryIndex]}`
    : `${category.name}`;
 
  return res;
}

/**
 * This function filters to only positive memory size values in the native allocations.
 * It removes all of the deallocation information.
 */
export function filterToAllocations(
  nativeAllocations: NativeAllocationsTable
): NativeAllocationsTable {
  let newNativeAllocations;
  if (nativeAllocations.memoryAddress) {
    newNativeAllocations = getEmptyBalancedNativeAllocationsTable();
    for (let i = 0; i < nativeAllocations.length; i++) {
      const weight = nativeAllocations.weight[i];
      if (weight > 0) {
        newNativeAllocations.time.push(nativeAllocations.time[i]);
        newNativeAllocations.stack.push(nativeAllocations.stack[i]);
        newNativeAllocations.weight.push(weight);
        newNativeAllocations.memoryAddress.push(
          nativeAllocations.memoryAddress[i]
        );
        newNativeAllocations.threadId.push(nativeAllocations.threadId[i]);
        newNativeAllocations.length++;
      }
    }
  } else {
    newNativeAllocations = getEmptyUnbalancedNativeAllocationsTable();
    for (let i = 0; i < nativeAllocations.length; i++) {
      const weight = nativeAllocations.weight[i];
      if (weight > 0) {
        newNativeAllocations.time.push(nativeAllocations.time[i]);
        newNativeAllocations.stack.push(nativeAllocations.stack[i]);
        newNativeAllocations.weight.push(weight);
        newNativeAllocations.length++;
      }
    }
  }
  return newNativeAllocations;
}

/**
 * This function filters to only negative memory size values in the native allocations.
 * It shows all of the memory frees.
 */
export function filterToDeallocationsSites(
  nativeAllocations: NativeAllocationsTable
): NativeAllocationsTable {
  let newNativeAllocations;
  if (nativeAllocations.memoryAddress) {
    newNativeAllocations = getEmptyBalancedNativeAllocationsTable();
    for (let i = 0; i < nativeAllocations.length; i++) {
      const weight = nativeAllocations.weight[i];
      if (weight < 0) {
        newNativeAllocations.time.push(nativeAllocations.time[i]);
        newNativeAllocations.stack.push(nativeAllocations.stack[i]);
        newNativeAllocations.weight.push(weight);
        newNativeAllocations.memoryAddress.push(
          nativeAllocations.memoryAddress[i]
        );
        newNativeAllocations.threadId.push(nativeAllocations.threadId[i]);
        newNativeAllocations.length++;
      }
    }
  } else {
    newNativeAllocations = getEmptyUnbalancedNativeAllocationsTable();
    for (let i = 0; i < nativeAllocations.length; i++) {
      const weight = nativeAllocations.weight[i];
      if (weight < 0) {
        newNativeAllocations.time.push(nativeAllocations.time[i]);
        newNativeAllocations.stack.push(nativeAllocations.stack[i]);
        newNativeAllocations.weight.push(weight);
        newNativeAllocations.length++;
      }
    }
  }
  return newNativeAllocations;
}

/**
 * This function filters to only negative memory size values in the native allocations.
 * It rewrites the stacks to point back to the stack of the allocation.
 */
export function filterToDeallocationsMemory(
  nativeAllocations: BalancedNativeAllocationsTable
): NativeAllocationsTable {
  // This is how the allocation table looks like:
  // A-----D------A-------D

  // This is like a Map<MemoryAddress, IndexIntoStackTable | null>;
  const memoryAddressToAllocationSite: Array<IndexIntoStackTable | null> = [];
  const newDeallocations = getEmptyBalancedNativeAllocationsTable();

  for (
    let allocationIndex = 0;
    allocationIndex < nativeAllocations.length;
    allocationIndex++
  ) {
    const bytes = nativeAllocations.weight[allocationIndex];
    const memoryAddress = nativeAllocations.memoryAddress[allocationIndex];
    if (bytes >= 0) {
      // This is an allocation.

      // Provide a map back to this index.
      if (memoryAddress in memoryAddressToAllocationSite) {
        console.error(oneLine`
          The address ${memoryAddress} was already present when we wanted to add it.
          This probably means the deallocation wasn't collected, which may sometimes
          happen. We will overwrite the previous entry.
        `);
      }
      memoryAddressToAllocationSite[memoryAddress] =
        nativeAllocations.stack[allocationIndex];
      continue;
    }

    // This is a deallocation.
    // Lookup the previous allocation.
    const allocationStackIndex = memoryAddressToAllocationSite[memoryAddress];
    if (allocationStackIndex === undefined) {
      // This deallocation doesn't match an allocation. Let's bail out.
      continue;
    }

    // This deallocation matches a previous allocation.
    newDeallocations.time.push(nativeAllocations.time[allocationIndex]);
    newDeallocations.stack.push(allocationStackIndex);
    newDeallocations.weight.push(bytes);
    newDeallocations.memoryAddress.push(memoryAddress);
    newDeallocations.threadId.push(nativeAllocations.threadId[allocationIndex]);
    newDeallocations.length++;

    // Remove the saved allocation
    delete memoryAddressToAllocationSite[memoryAddress];
  }

  return newDeallocations;
}

/**
 * Currently the native allocations naively collect allocations and deallocations.
 * There is no attempt to match up the sampled allocations with the deallocations.
 * Because of this, if a calltree were to combine both allocations and deallocations,
 * then the summary would most likely lie and not misreport leaked or retained memory.
 * For now, filter to only showing allocations or deallocations.
 *
 * This function filters to only positive values.
 */
export function filterToRetainedAllocations(
  nativeAllocations: BalancedNativeAllocationsTable
): NativeAllocationsTable {
  // A-----D------A-------D
  type Address = number;
  type IndexIntoAllocations = number;
  const memoryAddressToAllocation: Map<Address, IndexIntoAllocations> =
    new Map();
  const retainedAllocation = [];
  for (
    let allocationIndex = 0;
    allocationIndex < nativeAllocations.length;
    allocationIndex++
  ) {
    const bytes = nativeAllocations.weight[allocationIndex];
    const memoryAddress = nativeAllocations.memoryAddress[allocationIndex];
    if (bytes >= 0) {
      // Handle the allocation.

      // Provide a map back to this index.
      memoryAddressToAllocation.set(memoryAddress, allocationIndex);
      retainedAllocation[allocationIndex] = true;
    } else {
      // Do not retain deallocations.
      retainedAllocation[allocationIndex] = false;

      // Lookup the previous allocation.
      const previousAllocationIndex =
        memoryAddressToAllocation.get(memoryAddress);
      if (previousAllocationIndex !== undefined) {
        // This deallocation matches a previous allocation. Remove the allocation.
        retainedAllocation[previousAllocationIndex] = false;
        // There is a match, so delete this old association.
        memoryAddressToAllocation.delete(memoryAddress);
      }
    }
  }

  const newNativeAllocations = getEmptyBalancedNativeAllocationsTable();
  for (let i = 0; i < nativeAllocations.length; i++) {
    const weight = nativeAllocations.weight[i];
    if (retainedAllocation[i]) {
      newNativeAllocations.time.push(nativeAllocations.time[i]);
      newNativeAllocations.stack.push(nativeAllocations.stack[i]);
      newNativeAllocations.weight.push(weight);
      newNativeAllocations.memoryAddress.push(
        nativeAllocations.memoryAddress[i]
      );
      newNativeAllocations.threadId.push(nativeAllocations.threadId[i]);
      newNativeAllocations.length++;
    }
  }

  return newNativeAllocations;
}

/**
 * Extract the hostname and favicon from the first page if we are in single tab
 * view. Currently we assume that we don't change the origin of webpages while
 * profiling in web developer preset. That's why we are simply getting the first
 * page we find that belongs to the active tab. Returns null if profiler is not
 * in the single tab view at the moment.
 */
export function extractProfileFilterPageData(
  pages: PageList | null,
  relevantPages: Set<InnerWindowID>
): ProfileFilterPageData | null {
  if (relevantPages.size === 0 || pages === null) {
    // Either we are not in single tab view, or we don't have pages array(which
    // is the case for older profiles). Return early.
    return null;
  }

  // Getting the pages that are relevant and a top-most frame.
  let filteredPages = pages.filter(
    (page) =>
      // It's the top-most frame if `embedderInnerWindowID` is zero.
      page.embedderInnerWindowID === 0 && relevantPages.has(page.innerWindowID)
  );

  if (filteredPages.length > 1) {
    // If there are more than one top-most page, it's also good to filter out the
    // `about:` pages so user can see their url they are actually profiling.
    filteredPages = filteredPages.filter(
      (page) => !page.url.startsWith('about:')
    );
  }

  if (filteredPages.length === 0) {
    // There should be at least one relevant page.
    console.error(`Expected a relevant page but couldn't find it.`);
    return null;
  }

  const pageUrl = filteredPages[0].url;

  if (pageUrl.startsWith('about:')) {
    // If we only have an `about:*` page, we should return early with a friendly
    // origin and hostname. Otherwise the try block will fail.
    return {
      origin: pageUrl,
      hostname: pageUrl,
      favicon: null,
    };
  }

  try {
    const page = new URL(pageUrl);
    // FIXME(Bug 1620546): This is not ideal and we should get the favicon
    // either during profile capture or profile pre-process.
    const favicon = new URL('/favicon.ico', page.origin);
    if (favicon.protocol === 'http:') {
      // Upgrade http requests.
      favicon.protocol = 'https:';
    }
    return {
      origin: page.origin,
      hostname: page.hostname,
      favicon: favicon.href,
    };
  } catch (e) {
    console.error(
      'Error while extracing the hostname and favicon from the page url',
      pageUrl
    );
    return null;
  }
}

// Returns the resource index for a "url" or "webhost" resource which is created
// on demand based on the script URI.
export function getOrCreateURIResource(
  scriptURI: string,
  resourceTable: ResourceTable,
  stringTable: UniqueStringArray,
  originToResourceIndex: Map<string, IndexIntoResourceTable>
): IndexIntoResourceTable {
  // Figure out the origin and host.
  let origin;
  let host;
  try {
    const url = new URL(scriptURI);
    if (
      !(
        url.protocol === 'http:' ||
        url.protocol === 'https:' ||
        url.protocol === 'moz-extension:'
      )
    ) {
      throw new Error('not a webhost or extension protocol');
    }
    origin = url.origin;
    host = url.host;
  } catch (e) {
    origin = scriptURI;
    host = null;
  }

  let resourceIndex = originToResourceIndex.get(origin);
  if (resourceIndex !== undefined) {
    return resourceIndex;
  }

  resourceIndex = resourceTable.length++;
  originToResourceIndex.set(origin, resourceIndex);
  if (host) {
    // This is a webhost URL.
    resourceTable.lib[resourceIndex] = null;
    resourceTable.name[resourceIndex] = stringTable.indexForString(origin);
    resourceTable.host[resourceIndex] = stringTable.indexForString(host);
    resourceTable.type[resourceIndex] = resourceTypes.webhost;
  } else {
    // This is a URL, but it doesn't point to something on the web, e.g. a
    // chrome url.
    resourceTable.lib[resourceIndex] = null;
    resourceTable.name[resourceIndex] = stringTable.indexForString(scriptURI);
    resourceTable.host[resourceIndex] = null;
    resourceTable.type[resourceIndex] = resourceTypes.url;
  }
  return resourceIndex;
}

/**
 * See the ThreadsKey type for an explanation.
 */
export function getThreadsKey(threadIndexes: Set<ThreadIndex>): ThreadsKey {
  if (threadIndexes.size === 1) {
    // Return the ThreadIndex directly if there is only one thread.
    // We know this value exists because of the size check, even if Flow doesn't.
    return ensureExists(getFirstItemFromSet(threadIndexes));
  }

  return [...threadIndexes].sort((a, b) => b - a).join(',');
}

/**
 * Checks if threadIndexesSet contains all the threads in the threadsKey.
 */
export function hasThreadKeys(
  threadIndexesSet: Set<ThreadIndex>,
  threadsKey: ThreadsKey
): boolean {
  const threadIndexes = ('' + threadsKey).split(',').map((n) => +n);
  for (const threadIndex of threadIndexes) {
    if (!threadIndexesSet.has(threadIndex)) {
      return false;
    }
  }
  return true;
}

export type StackReferences = {|
  // Stacks which were sampled by sampling. For native stacks, the
  // corresponding frame address was observed as a value of the instruction
  // pointer register.
  samplingSelfStacks: Set<IndexIntoStackTable>,
  // Stacks which were obtained during a synchronous backtrace. For
  // native stacks, the corresponding frame address is *not* an observed
  // value of the instruction pointer, because synchronous backtraces have
  // a few frames removed from the end of the stack, which includes the
  // frame with the instruction pointer. This difference only matters for
  // "return address nudging" which happens at the end of profile processing.
  syncBacktraceSelfStacks: Set<IndexIntoStackTable>,
|};

/**
 * Find the sets of stacks that are referenced as "self" stacks by
 * various tables in the thread.
 * The stacks' ancestor nodes are not included (except for any ancestor
 * nodes that had self time, i.e. were also referenced directly).
 * The returned sets are split into two groups: Stacks referenced by
 * samples, and stacks referenced by sync backtraces (e.g. marker causes).
 * The two have slightly different properties, see the type definition.
 */
export function gatherStackReferences(thread: Thread): StackReferences {
  const samplingSelfStacks = new Set();
  const syncBacktraceSelfStacks = new Set();

  const { samples, markers, jsAllocations, nativeAllocations } = thread;

  // Samples
  for (let i = 0; i < samples.length; i++) {
    const stack = samples.stack[i];
    if (stack !== null) {
      samplingSelfStacks.add(stack);
    }
  }

  // Markers
  for (let i = 0; i < markers.length; i++) {
    const data = markers.data[i];
    if (data && data.cause) {
      const stack = data.cause.stack;
      if (stack !== null) {
        syncBacktraceSelfStacks.add(stack);
      }
    }
  }

  // JS allocations
  if (jsAllocations !== undefined) {
    for (let i = 0; i < jsAllocations.length; i++) {
      const stack = jsAllocations.stack[i];
      if (stack !== null) {
        syncBacktraceSelfStacks.add(stack);
      }
    }
  }

  // Native allocations
  if (nativeAllocations !== undefined) {
    for (let i = 0; i < nativeAllocations.length; i++) {
      const stack = nativeAllocations.stack[i];
      if (stack !== null) {
        syncBacktraceSelfStacks.add(stack);
      }
    }
  }

  return { samplingSelfStacks, syncBacktraceSelfStacks };
}

/**
 * Create a new thread with all stack references translated via the given
 * maps. The maps map IndexIntoOldStackTable -> IndexIntoNewStackTable.
 * Only a subset of entries are read from the map: The same stacks that
 * gatherStackReferences found in the thread. All other entries are ignored
 * and do not need to be present.
 * With the exception of the caller which does the initial return address
 * nudging, most callers will want to pass the same map to both map arguments.
 */
export function replaceStackReferences(
  thread: Thread,
  mapForSamplingSelfStacks: Map<
    IndexIntoStackTable,
    IndexIntoStackTable | null
  >,
  mapForBacktraceSelfStacks: Map<
    IndexIntoStackTable,
    IndexIntoStackTable | null
  >
): Thread {
  const {
    samples: oldSamples,
    markers: oldMarkers,
    jsAllocations: oldJsAllocations,
    nativeAllocations: oldNativeAllocations,
  } = thread;

  // Samples
  const samples = {
    ...oldSamples,
    stack: oldSamples.stack.map((oldStackIndex) => {
      if (oldStackIndex === null) {
        return null;
      }
      const newStack = mapForSamplingSelfStacks.get(oldStackIndex);
      if (newStack === undefined) {
        throw new Error(
          `Missing mapForSamplingSelfStacks entry for stack ${oldStackIndex}`
        );
      }
      return newStack;
    }),
  };

  function mapBacktraceSelfStack(oldStackIndex) {
    if (oldStackIndex === null) {
      return null;
    }
    const newStack = mapForBacktraceSelfStacks.get(oldStackIndex);
    if (newStack === undefined) {
      throw new Error(
        `Missing mapForBacktraceSelfStacks entry for stack ${oldStackIndex}`
      );
    }
    return newStack;
  }

  // Markers
  function replaceStackReferenceInMarkerPayload(
    oldData: MarkerPayload | null
  ): MarkerPayload | null {
    if (oldData && 'cause' in oldData && oldData.cause) {
      // Replace the cause with the right stack index.
      // Use (...: any) because our current version of Flow has trouble with
      // the object spread operator.
      return ({
        ...oldData,
        cause: {
          ...oldData.cause,
          stack: mapBacktraceSelfStack(oldData.cause.stack),
        },
      }: any);
    }
    return oldData;
  }
  const markers = {
    ...oldMarkers,
    data: oldMarkers.data.map(replaceStackReferenceInMarkerPayload),
  };

  // JS allocations
  let jsAllocations;
  if (oldJsAllocations !== undefined) {
    jsAllocations = {
      ...oldJsAllocations,
      stack: oldJsAllocations.stack.map(mapBacktraceSelfStack),
    };
  }

  // Native allocations
  let nativeAllocations;
  if (oldNativeAllocations !== undefined) {
    nativeAllocations = {
      ...oldNativeAllocations,
      stack: oldNativeAllocations.stack.map(mapBacktraceSelfStack),
    };
  }

  return { ...thread, samples, markers, jsAllocations, nativeAllocations };
}

/**
 * Creates a new thread with modified frame and stack tables for "nudged" return addresses:
 * All return addresses are moved backwards by one byte, to point into the "call"
 * instruction. This allows symbolication to obtain accurate line numbers and inline frames
 * for these frames.
 * Addresses which were sampled from the instruction pointer register remain unchanged.
 * Non-native frames (i.e profiler label frames or JS frames) also remain unchanged.
 *
 * This function is called at the end of profile processing. In the Gecko profile format,
 * caller frame addresses are return addresses. In the processed profile format, caller
 * frame addresses point at/into the call instruction.
 *
 * # Motivation
 *
 * When the profiler captures a stack, the frame addresses in the stack come from two
 * different sources:
 *
 *  1. The top frame comes from the instruction pointer register. The register contains the
 *     address of the instruction that is currently executing.
 *  2. The other frames come from stack walking. Stack walkers calculate the return
 *     addresses for all caller functions that are on the stack. A "return address" is the
 *     address that the CPU will jump to once the called function returns. It is the
 *     address of the instruction *after* the "call" instruction.
 *     The Gecko profile format assumes that all caller frame addresses are return
 *     addresses.
 *
 * Here's an example, where _LZ4F_compressUpdate calls _LZ4F_localSaveDict and the
 * CPU was observed executing an instruction in _LZ4F_localSaveDict.
 * The frame addresses in the stack are: [..., 0x5783a, 0x57c17].
 * (The example uses libmozglue.dylib 64EC2645330C3A0BA6E4EBCD28A1B5940.)
 *
 * Top of stack:
 *   _LZ4F_localSaveDict:
 *     57c10  push  rbp
 *     57c11  mov   rbp, rsp
 *     57c14  mov   rax, rdi
 * --> 57c17  cmp   dword [rdi+0x20], 0x2    ; instruction pointer, address maps to line 808
 *     57c1b  mov   rdi, qword [rdi+0xa8]
 *     57c22  jle   loc_57c33
 *     [...]
 *
 * Caller:
 *   _LZ4F_compressUpdate:
 *     [...]
 *     5782d  jmp   loc_5765f
 *     57832  mov   rdi, rbx
 *     57835  call  _LZ4F_localSaveDict       ; call instruction, address maps to line 897
 * --> 5783a  test  eax, eax                  ; return address,   address maps to line 898
 *     5783c  mov   rcx, 0xffffffffffffffff
 *     [...]
 *
 * Corresponding C code:
 *
 * [...]
 * 893    if ((cctxPtr->prefs.frameInfo.blockMode==LZ4F_blockLinked) && (lastBlockCompressed==fromSrcBuffer)) {
 * 894        if (compressOptionsPtr->stableSrc) {
 * 895            cctxPtr->tmpIn = cctxPtr->tmpBuff;
 * 896        } else {
 * 897            int const realDictSize = LZ4F_localSaveDict(cctxPtr);   // <-- here is the call
 * 898            if (realDictSize==0) return err0r(LZ4F_ERROR_GENERIC);  // <-- here is the line we'd get for the return address
 * 899            cctxPtr->tmpIn = cctxPtr->tmpBuff + realDictSize;
 * 900        }
 * 901    }
 * [...]
 *
 * During symbolication, we resolve each address to a source file + line number.
 * However, if we were to look up the line number for a return address, we get the
 * line number for the instruction *after* the "call" instruction. In the example,
 * 0x5783a is the return address, and symbolicating 0x5783a gives us line number 898.
 * This is not the line number we want! We want to know *which line contains the
 * function call*. So we need to look up the address of the call instruction, or at
 * least an address that falls "inside" the call instruction.
 * In the example, the call instruction is at 0x57835 and the return address is 0x5783a.
 * So the call instruction occupies 5 bytes starting at 0x57835. Any address in that
 * range, i.e. any address with `0x57835 <= address && address < 0x5783a`, will
 * symbolicate to line number 897. This is the line number we want.
 *
 * To keep it simple, we will just subtract one byte from the return address. This
 * won't point at the start of the call instruction, but it will point inside of it,
 * which is good enough.
 *
 * ## Alternatives
 *
 * There are two places where we could potentially perform the one-byte adjustment:
 * We can bake it into the frame table, or we can leave the frame table as-is and
 * do the adjustment only when we prepare the symbolication request. For the latter,
 * we would need a way to know which addresses need adjustment and which do not.
 * So we'd need a per-frame bit (e.g. a new frame table column) to differentiate
 * these frames.
 * However, we don't really have a use for the unchanged return address. The only
 * places where we make use of the frame address is during symbolication, and, in the
 * future, in an assembly view. Both uses want to account the sample time to the
 * calling instruction.
 * So for simplicity, this function chooses the "bake it into the frame table"
 * approach, and the processed format is documented to contain this adjustment.
 *
 * ## Summary
 *
 * To reiterate: The adjustment performed by this function is absolutely critical
 * for useful line numbers.  It may be "just one byte", but it makes all the
 * difference in having trustworthy information.
 * Without the adjustment, line numbers can be way off - in the example it was just
 * the very next line, but it could potentially be anywhere else in the function!
 * And finally, this issue does not only affect line numbers, it also affects inline
 * frames, for the same reason: The instruction after the call instruction could be
 * the result of a completely different function that was inlined at this spot.
 * If we instead look up the inline frames for the call instruction, we will get
 * the correct inline frames at the point of the function call.
 *
 * # Implementation
 *
 * There are two slightly tricky parts to the implementation of this function.
 *
 *  1. The original frame table + stack table does not annotate which frames came
 *     from the instruction pointer and which frames came from stack walking. We have
 *     to look at the rest of the thread to see which stack nodes are referenced from
 *     where.
 *  2. Some stack nodes and frames in the original thread serve a dual purpose: The
 *     address of an instruction that directly follows a call instruction could have
 *     been observed in both manners, at different times. And a stack node could be
 *     used in both contexts. If we detect that this happened, we need to duplicate
 *     the frame and the stack node and pick the right one depending on the use.
 */
export function nudgeReturnAddresses(thread: Thread): Thread {
  const { samplingSelfStacks, syncBacktraceSelfStacks } =
    gatherStackReferences(thread);

  const { stackTable, frameTable } = thread;

  // Collect frames that were obtained from the instruction pointer.
  // These are the top ("self") frames of stacks from sampling.
  // In the variable names below, ip means "instruction pointer".
  const oldIpFrameToNewIpFrame = new Uint32Array(frameTable.length);
  const ipFrames = new Set();
  for (const stack of samplingSelfStacks) {
    const frame = stackTable.frame[stack];
    oldIpFrameToNewIpFrame[frame] = frame;
    const address = frameTable.address[frame];
    if (address !== -1) {
      ipFrames.add(frame);
    }
  }

  // Collect frames that were obtained from stack walking.
  // These are any "self" frames of sync backtraces, and any frames
  // used for "prefix" stacks, i.e. callers.
  const returnAddressFrames: Map<IndexIntoFrameTable, Address> = new Map();
  const prefixStacks: Set<IndexIntoStackTable> = new Set();
  for (const stack of syncBacktraceSelfStacks) {
    const frame = stackTable.frame[stack];
    const returnAddress = frameTable.address[frame];
    if (returnAddress !== -1) {
      returnAddressFrames.set(frame, returnAddress);
    }
  }
  for (let stack = 0; stack < stackTable.length; stack++) {
    const prefix = stackTable.prefix[stack];
    if (prefix === null || prefixStacks.has(prefix)) {
      continue;
    }
    prefixStacks.add(prefix);
    const prefixFrame = stackTable.frame[prefix];
    const prefixAddress = frameTable.address[prefixFrame];
    if (prefixAddress !== -1) {
      returnAddressFrames.set(prefixFrame, prefixAddress);
    }
  }

  if (ipFrames.size === 0 && returnAddressFrames.size === 0) {
    // Nothing to do, use the original thread.
    return thread;
  }

  // Create the new frame table.
  // Frames that were observed both from the instruction pointer and from
  // stack walking have to be duplicated.
  const newFrameTable = shallowCloneFrameTable(frameTable);
  // Iterate over all *return address* frames, i.e. all frames that were obtained
  // by stack walking.
  for (const [frame, address] of returnAddressFrames) {
    if (ipFrames.has(frame)) {
      // This address of this frame was observed both as a return address and as
      // an instruction pointer register value. We have to duplicate this frame so
      // so that we can make a distinction between the two uses.
      // The new frame will be used as the ipFrame, and the old frame will be used
      // as the return address frame (and have its address nudged).
      const newIpFrame = newFrameTable.length;
      newFrameTable.address.push(address);
      newFrameTable.inlineDepth.push(frameTable.inlineDepth[frame]);
      newFrameTable.category.push(frameTable.category[frame]);
      newFrameTable.subcategory.push(frameTable.subcategory[frame]);
      newFrameTable.func.push(frameTable.func[frame]);
      newFrameTable.nativeSymbol.push(frameTable.nativeSymbol[frame]);
      newFrameTable.innerWindowID.push(frameTable.innerWindowID[frame]);
      newFrameTable.implementation.push(frameTable.implementation[frame]);
      newFrameTable.line.push(frameTable.line[frame]);
      newFrameTable.column.push(frameTable.column[frame]);
      newFrameTable.length++;
      oldIpFrameToNewIpFrame[frame] = newIpFrame;
      // Note: The duplicated frame uses the same func as the original frame.
      // This is ok because return address nudging is never expected to move
      // an address to a different function, so symbolication should never
      // have a need to split these frames into different functions.
    }
    // Subtract 1 byte from the return address.
    newFrameTable.address[frame] = address - 1;

    // Note that we don't change the funcTable.
    // Before symbolication, the funcTable name for the native frames are
    // of the form "0xhexaddress", and this string will still be the original
    // un-adjusted return address. Symbolication will fix that up.
    // Leaving the old string is ok; we're adjusting the frame address and
    // symbolication only looks at the frame address.
  }

  // Now the frame table contains adjusted / "nudged" addresses.

  // Make a new stack table which refers to the adjusted frames.
  const newStackTable = getEmptyStackTable();
  const mapForSamplingSelfStacks = new Map();
  const mapForBacktraceSelfStacks = new Map();
  const prefixMap = new Uint32Array(stackTable.length);
  for (let stack = 0; stack < stackTable.length; stack++) {
    const frame = stackTable.frame[stack];
    const category = stackTable.category[stack];
    const subcategory = stackTable.subcategory[stack];
    const prefix = stackTable.prefix[stack];

    const newPrefix = prefix === null ? null : prefixMap[prefix];

    if (prefixStacks.has(stack) || syncBacktraceSelfStacks.has(stack)) {
      // Copy this stack to the new stack table, and use the original frame
      // (which will have the nudged address if this is a return address stack).
      const newStackIndex = newStackTable.length;
      newStackTable.frame.push(frame);
      newStackTable.category.push(category);
      newStackTable.subcategory.push(subcategory);
      newStackTable.prefix.push(newPrefix);
      newStackTable.length++;
      prefixMap[stack] = newStackIndex;
      mapForBacktraceSelfStacks.set(stack, newStackIndex);
    }

    if (samplingSelfStacks.has(stack)) {
      // Copy this stack to the new stack table, and use the potentially duplicated
      // frame, with a non-nudged address.
      const ipFrame = oldIpFrameToNewIpFrame[frame];
      const newStackIndex = newStackTable.length;
      newStackTable.frame.push(ipFrame);
      newStackTable.category.push(category);
      newStackTable.subcategory.push(subcategory);
      newStackTable.prefix.push(newPrefix);
      newStackTable.length++;
      mapForSamplingSelfStacks.set(stack, newStackIndex);
    }
  }

  const newThread = {
    ...thread,
    frameTable: newFrameTable,
    stackTable: newStackTable,
  };

  return replaceStackReferences(
    newThread,
    mapForSamplingSelfStacks,
    mapForBacktraceSelfStacks
  );
}

/**
 * Find the address and library (debugName, breakpadId) for any frame which
 * was symbolicated to the given filename.
 */
export function findAddressProofForFile(
  profile: Profile,
  file: string
): AddressProof | null {
  const { libs } = profile;
  for (const thread of profile.threads) {
    const { frameTable, funcTable, resourceTable, stringTable } = thread;
    const fileStringIndex = stringTable.indexForString(file);
    const func = funcTable.fileName.indexOf(fileStringIndex);
    if (func === -1) {
      continue;
    }
    const frame = frameTable.func.indexOf(func);
    if (frame === -1) {
      continue;
    }
    const address = frameTable.address[frame];
    if (address === null) {
      continue;
    }
    const resource = funcTable.resource[func];
    if (resourceTable.type[resource] !== resourceTypes.library) {
      continue;
    }
    const libIndex = resourceTable.lib[resource];
    if (libIndex === null) {
      continue;
    }
    const lib = libs[libIndex];
    const { debugName, breakpadId } = lib;
    return {
      debugName,
      breakpadId,
      address,
    };
  }
  return null;
}

/**
 * Calculate a lower bound for the function size, in bytes, of a native symbol.
 * This is used when the symbol server does not return a size for a function.
 * We need to know the size when we want to show assembly code for the function,
 * in order to know how many bytes to disassemble.
 * We estimate the size by finding the highest known address for this symbol in
 * the frame table, and adding one byte (because the instruction at that address
 * is at least one byte long).
 */
export function calculateFunctionSizeLowerBound(
  frameTable: FrameTable,
  nativeSymbolAddress: Address,
  nativeSymbolIndex: IndexIntoNativeSymbolTable
): Bytes {
  let maxFrameAddress = nativeSymbolAddress;
  for (let i = 0; i < frameTable.length; i++) {
    if (frameTable.nativeSymbol[i] === nativeSymbolIndex) {
      const frameAddress = frameTable.address[i];
      if (frameAddress > maxFrameAddress) {
        maxFrameAddress = frameAddress;
      }
    }
  }
  return maxFrameAddress + 1 - nativeSymbolAddress;
}

/**
 * Gathers the native symbols for a given call node. In most cases, a call node
 * just has one native symbol (or zero if it's not native code). But in some
 * cases, a call node can have its native code in multiple different functions,
 * for example in the inverted tree if it was inlined into multiple different
 * functions.
 */
export function getNativeSymbolsForCallNode(
  callNodeIndex: IndexIntoCallNodeTable,
  { stackIndexToCallNodeIndex }: CallNodeInfo,
  stackTable: StackTable,
  frameTable: FrameTable
): IndexIntoNativeSymbolTable[] {
  const set = new Set();
  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    if (stackIndexToCallNodeIndex[stackIndex] === callNodeIndex) {
      const frame = stackTable.frame[stackIndex];
      const nativeSymbol = frameTable.nativeSymbol[frame];
      if (nativeSymbol !== null) {
        set.add(nativeSymbol);
      }
    }
  }
  return [...set];
}

/**
 * Convert a native symbol index into a NativeSymbolInfo object, to create
 * something that's meaningful outside of its associated thread.
 */
export function getNativeSymbolInfo(
  nativeSymbol: IndexIntoNativeSymbolTable,
  nativeSymbols: NativeSymbolTable,
  frameTable: FrameTable,
  stringTable: UniqueStringArray
): NativeSymbolInfo {
  const functionSizeOrNull = nativeSymbols.functionSize[nativeSymbol];
  const functionSize =
    functionSizeOrNull ??
    calculateFunctionSizeLowerBound(
      frameTable,
      nativeSymbols.address[nativeSymbol],
      nativeSymbol
    );
  return {
    libIndex: nativeSymbols.libIndex[nativeSymbol],
    address: nativeSymbols.address[nativeSymbol],
    name: stringTable.getString(nativeSymbols.name[nativeSymbol]),
    functionSize,
    functionSizeIsKnown: functionSizeOrNull !== null,
  };
}

/**
 * Calculate the BottomBoxInfo for a call node, i.e. information about which
 * things should be shown in the profiler UI's "bottom box" when this call node
 * is double-clicked.
 *
 * We always want to update all panes in the bottom box when a new call node is
 * double-clicked, so that we don't show inconsistent information side-by-side.
 */
export function getBottomBoxInfoForCallNode(
  callNodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfo,
  thread: Thread
): BottomBoxInfo {
  const {
    stackTable,
    frameTable,
    funcTable,
    stringTable,
    resourceTable,
    nativeSymbols,
  } = thread;

  const funcIndex = callNodeInfo.callNodeTable.func[callNodeIndex];
  const fileName = funcTable.fileName[funcIndex];
  const sourceFile = fileName !== null ? stringTable.getString(fileName) : null;
  const resource = funcTable.resource[funcIndex];
  const libIndex =
    resource !== -1 && resourceTable.type[resource] === resourceTypes.library
      ? resourceTable.lib[resource]
      : null;
  const nativeSymbolsForCallNode = getNativeSymbolsForCallNode(
    callNodeIndex,
    callNodeInfo,
    stackTable,
    frameTable
  );
  const nativeSymbolInfosForCallNode = nativeSymbolsForCallNode.map(
    (nativeSymbolIndex) =>
      getNativeSymbolInfo(
        nativeSymbolIndex,
        nativeSymbols,
        frameTable,
        stringTable
      )
  );

  return {
    libIndex,
    sourceFile,
    nativeSymbols: nativeSymbolInfosForCallNode,
  };
}

/**
 * Determines the timeline type by looking at the profile data.
 *
 * There are three options:
 * 'cpu-category': If a profile has both category and cpu usage information.
 * 'category': If a profile has category information but not the cpu usage.
 * 'stack': If a profile doesn't have category or cpu usage information.
 */
export function determineTimelineType(profile: Profile): TimelineType {
  if (!profile.meta.categories) {
    // Profile doesn't have categories. We don't have enough information to draw
    // a proper category view with activity graph. Use the stack chart instead.
    // It can be either an imported or a very old profile.
    return 'stack';
  }

  if (
    !profile.meta.sampleUnits ||
    !profile.threads.some((thread) => thread.samples.threadCPUDelta)
  ) {
    // Have category information but doesn't have the CPU usage information.
    // Use 'category'.
    return 'category';
  }

  // Have both category and CPU usage information. Use 'cpu-category'.
  return 'cpu-category';
}
