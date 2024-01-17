/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import classNames from 'classnames';
import { selectActiveTabTrack } from 'firefox-profiler/actions/profile-view';
import { getSelectedThreadIndexes } from 'firefox-profiler/selectors/url-state';
import explicitConnect from 'firefox-profiler/utils/connect';
import {
  getActiveTabGlobalTracks,
  getActiveTabResourceTracks,
} from 'firefox-profiler/selectors/profile';
import './Track.css';
import { TimelineTrackThread } from './TrackThread';
import { TimelineTrackScreenshots } from './TrackScreenshots';
import { TimelineActiveTabResourcesPanel } from './ActiveTabResourcesPanel';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';
import { hasThreadKeys } from 'firefox-profiler/profile-logic/profile-data';

import type {
  GlobalTrackReference,
  TrackIndex,
  ActiveTabGlobalTrack,
  InitialSelectedTrackReference,
  ActiveTabResourceTrack,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type OwnProps = {|
  +trackReference: GlobalTrackReference,
  +trackIndex: TrackIndex,
  +setInitialSelected: (
    el: InitialSelectedTrackReference,
    forceScroll?: boolean
  ) => void,
|};

type StateProps = {|
  +globalTrack: ActiveTabGlobalTrack,
  +isSelected: boolean,
  +resourceTracks: ActiveTabResourceTrack[],
|};

type DispatchProps = {|
  +selectActiveTabTrack: typeof selectActiveTabTrack,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

/**
 * Global track of active tab timeline view. Differently from the full view,
 * it shows either screenshot and a single main track for active tab and
 * resources tracks inside it.
 */
class ActiveTabGlobalTrackComponent extends PureComponent<Props> {
  _container: HTMLElement | null = null;
  _isInitialSelectedPane: boolean | null = null;
  _selectCurrentTrack = () => {
    const { selectActiveTabTrack, trackReference } = this.props;
    selectActiveTabTrack(trackReference);
  };

  renderTrack() {
    const { globalTrack } = this.props;
    switch (globalTrack.type) {
      case 'tab': {
        const { threadsKey } = globalTrack;
        return (
          <TimelineTrackThread
            threadsKey={threadsKey}
            showMemoryMarkers={false}
            trackType="expanded"
            trackName="Active Tab"
          />
        );
      }
      case 'screenshots': {
        const { threadIndex, id } = globalTrack;
        return (
          <TimelineTrackScreenshots threadIndex={threadIndex} windowId={id} />
        );
      }
      default:
        console.error(
          'Unhandled active tab globalTrack type',
          (globalTrack: empty)
        );
        return null;
    }
  }

  renderResourcesPanel() {
    const { resourceTracks, setInitialSelected } = this.props;
    if (resourceTracks.length === 0) {
      return null;
    }

    return (
      <TimelineActiveTabResourcesPanel
        resourceTracks={resourceTracks}
        setInitialSelected={setInitialSelected}
      />
    );
  }

  _takeContainerRef = (el: HTMLElement | null) => {
    const { isSelected } = this.props;
    this._container = el;

    if (isSelected) {
      this._isInitialSelectedPane = true;
    }
  };

  componentDidMount() {
    if (this._isInitialSelectedPane && this._container !== null) {
      // Handle the scrolling of the initial selected track into view.
      this.props.setInitialSelected(this._container);
    }
  }

  render() {
    const { isSelected } = this.props;

    return (
      <li ref={this._takeContainerRef} className="timelineTrack">
        <div
          className={classNames(
            'timelineTrackRow timelineTrackGlobalRow activeTab',
            {
              selected: isSelected,
            }
          )}
          onClick={this._selectCurrentTrack}
        >
          <div className="timelineTrackTrack">{this.renderTrack()}</div>
        </div>
        {this.renderResourcesPanel()}
      </li>
    );
  }
}

// Provide an empty list, so that strict equality checks work for component updates.
const EMPTY_RESOURCE_TRACKS = [];

export const TimelineActiveTabGlobalTrack = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state, { trackIndex }) => {
    const globalTracks = getActiveTabGlobalTracks(state);
    const globalTrack = globalTracks[trackIndex];

    // These get assigned based on the track type.
    let isSelected = false;
    let resourceTracks = EMPTY_RESOURCE_TRACKS;

    // Run different selectors based on the track type.
    switch (globalTrack.type) {
      case 'tab': {
        isSelected = hasThreadKeys(
          getSelectedThreadIndexes(state),
          globalTrack.threadsKey
        );
        resourceTracks = getActiveTabResourceTracks(state);
        break;
      }
      case 'screenshots':
        break;
      default:
        throw assertExhaustiveCheck(
          globalTrack,
          'Unhandled active tab GlobalTrack type.'
        );
    }

    return {
      globalTrack,
      isSelected,
      resourceTracks,
    };
  },
  mapDispatchToProps: {
    selectActiveTabTrack,
  },
  component: ActiveTabGlobalTrackComponent,
});
