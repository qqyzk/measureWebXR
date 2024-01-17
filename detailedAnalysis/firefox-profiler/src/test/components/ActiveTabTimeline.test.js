/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';

import { render, screen } from 'firefox-profiler/test/fixtures/testing-library';
import { Timeline } from '../../components/timeline';
import { TimelineActiveTabGlobalTrack } from '../../components/timeline/ActiveTabGlobalTrack';
import { TimelineActiveTabResourcesPanel } from '../../components/timeline/ActiveTabResourcesPanel';
import { TimelineActiveTabResourceTrack } from '../../components/timeline/ActiveTabResourceTrack';
import { changeTimelineTrackOrganization } from '../../actions/receive-profile';
import {
  getActiveTabGlobalTracks,
  getActiveTabResourceTracks,
} from '../../selectors/profile';
import { getFirstSelectedThreadIndex } from '../../selectors/url-state';
import { changeSelectedThreads } from '../../actions/profile-view';
import { ensureExists, getFirstItemFromSet } from '../../utils/flow';

import { storeWithProfile } from '../fixtures/stores';
import { getProfileWithNiceTracks } from '../fixtures/profiles/tracks';
import { fireFullClick } from '../fixtures/utils';
import { addActiveTabInformationToProfile } from '../fixtures/profiles/processed-profile';
import { autoMockCanvasContext } from '../fixtures/mocks/canvas-context';
import {
  autoMockElementSize,
  getElementWithFixedSize,
} from '../fixtures/mocks/element-size';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import { autoMockIntersectionObserver } from '../fixtures/mocks/intersection-observer';

describe('ActiveTabTimeline', function () {
  autoMockCanvasContext();
  autoMockElementSize({ width: 200, height: 300 });
  autoMockIntersectionObserver();
  beforeEach(() => {
    jest
      .spyOn(ReactDOM, 'findDOMNode')
      .mockImplementation(() =>
        getElementWithFixedSize({ width: 200, height: 300 })
      );
  });

  it('should be rendered properly from the Timeline component', () => {
    const { profile, parentInnerWindowIDsWithChildren, firstTabTabID } =
      addActiveTabInformationToProfile(getProfileWithNiceTracks());
    profile.threads[0].frameTable.innerWindowID[0] =
      parentInnerWindowIDsWithChildren;
    const store = storeWithProfile(profile);
    store.dispatch(
      changeTimelineTrackOrganization({
        type: 'active-tab',
        tabID: firstTabTabID,
      })
    );

    // WithSize uses requestAnimationFrame
    const flushRafCalls = mockRaf();
    const { container } = render(
      <Provider store={store}>
        <Timeline />
      </Provider>
    );
    flushRafCalls();
    expect(container.firstChild).toMatchSnapshot();
  });

  describe('ActiveTabGlobalTrack', function () {
    function setup() {
      const { profile, ...pageInfo } = addActiveTabInformationToProfile(
        getProfileWithNiceTracks()
      );
      profile.threads[0].frameTable.innerWindowID[0] =
        pageInfo.parentInnerWindowIDsWithChildren;
      const store = storeWithProfile(profile);
      store.dispatch(
        changeTimelineTrackOrganization({
          type: 'active-tab',
          tabID: pageInfo.firstTabTabID,
        })
      );
      const trackIndex = 0;
      const { getState, dispatch } = store;
      const trackReference = { type: 'global', trackIndex };
      const tracks = getActiveTabGlobalTracks(getState());
      const track = tracks[trackIndex];
      const setInitialSelected = () => {};
      if (track.type !== 'tab') {
        throw new Error('Expected a tab track.');
      }
      const threadIndex = ensureExists(
        getFirstItemFromSet(track.threadIndexes),
        'Expected a thread index for given active tab global track'
      );

      // The assertions are simpler if the GeckoMain tab thread is not already selected.
      dispatch(changeSelectedThreads(new Set([threadIndex + 1])));

      // WithSize uses requestAnimationFrame
      const flushRafCalls = mockRaf();

      const renderResult = render(
        <Provider store={store}>
          <TimelineActiveTabGlobalTrack
            trackIndex={trackIndex}
            trackReference={trackReference}
            setInitialSelected={setInitialSelected}
          />
        </Provider>
      );
      flushRafCalls();

      const { container } = renderResult;

      const getGlobalTrackRow = () =>
        ensureExists(
          container.querySelector('.timelineTrackGlobalRow'),
          `Couldn't find the track global row with selector .timelineTrackGlobalRow`
        );

      return {
        ...renderResult,
        ...pageInfo,
        dispatch,
        getState,
        profile,
        store,
        trackReference,
        trackIndex,
        threadIndex,
        getGlobalTrackRow,
      };
    }

    it('matches the snapshot of a global tab track', () => {
      const { container } = setup();
      expect(container.firstChild).toMatchSnapshot();
    });

    it('has useful parts of the component', function () {
      const { getGlobalTrackRow } = setup();
      expect(getGlobalTrackRow()).toBeTruthy();
    });

    it('starts out not being selected', function () {
      const { getState, getGlobalTrackRow, threadIndex } = setup();
      expect(getFirstSelectedThreadIndex(getState())).not.toBe(threadIndex);
      expect(getGlobalTrackRow()).not.toHaveClass('selected');
    });

    it('can select a thread by clicking the row', () => {
      const { getState, getGlobalTrackRow, threadIndex } = setup();
      expect(getFirstSelectedThreadIndex(getState())).not.toBe(threadIndex);
      fireFullClick(getGlobalTrackRow());
      expect(getFirstSelectedThreadIndex(getState())).toBe(threadIndex);
    });

    it('does not display the resources panel if there are no resource tracks', () => {
      const { getState } = setup();
      expect(getActiveTabResourceTracks(getState()).length).toBe(0);
      expect(screen.queryByText(/Resources/)).not.toBeInTheDocument();
    });
  });

  describe('ActiveTabResourcesPanel', function () {
    function setup() {
      const { profile, ...pageInfo } = addActiveTabInformationToProfile(
        getProfileWithNiceTracks()
      );
      const mainThreadIndex = 0;
      const resourceThreadIndex = 1;
      // Setting the first thread as parent track and the second as the iframe track.
      profile.threads[mainThreadIndex].frameTable.innerWindowID[0] =
        pageInfo.parentInnerWindowIDsWithChildren;
      profile.threads[resourceThreadIndex].frameTable.innerWindowID[0] =
        pageInfo.iframeInnerWindowIDsWithChild;
      const store = storeWithProfile(profile);
      store.dispatch(
        changeTimelineTrackOrganization({
          type: 'active-tab',
          tabID: pageInfo.firstTabTabID,
        })
      );
      const { getState, dispatch } = store;
      const resourceTracks = getActiveTabResourceTracks(getState());

      // WithSize uses requestAnimationFrame
      const flushRafCalls = mockRaf();

      const renderResult = render(
        <Provider store={store}>
          <TimelineActiveTabResourcesPanel
            resourceTracks={resourceTracks}
            setInitialSelected={() => {}}
          />
        </Provider>
      );

      flushRafCalls();

      const getResourcesPanelHeader = () => screen.getByText(/Resources/);
      const getResourceFrameTrack = () => screen.queryByText(/IFrame:/);

      return {
        ...renderResult,
        ...pageInfo,
        dispatch,
        getState,
        profile,
        store,
        getResourcesPanelHeader,
        getResourceFrameTrack,
        mainThreadIndex,
        resourceThreadIndex,
        flushRafCalls,
      };
    }

    it('matches the snapshot of a resources panel when closed', () => {
      const { container } = setup();
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches the snapshot of a resources panel when opened', () => {
      const { container, getResourcesPanelHeader, flushRafCalls } = setup();
      fireFullClick(getResourcesPanelHeader());
      flushRafCalls();
      expect(container.firstChild).toMatchSnapshot();
    });

    it('is closed by default', () => {
      const { getResourceFrameTrack } = setup();
      expect(getResourceFrameTrack()).toBeFalsy();
    });

    it('clicking on the header opens the resources panel', () => {
      const { getResourcesPanelHeader, getResourceFrameTrack, flushRafCalls } =
        setup();
      const resourcesPanelHeader = getResourcesPanelHeader();
      expect(getResourceFrameTrack()).toBeFalsy();

      fireFullClick(resourcesPanelHeader);
      flushRafCalls();
      expect(getResourceFrameTrack()).toBeTruthy();
    });

    it('selects the main track when panel is being closed', () => {
      const {
        getResourcesPanelHeader,
        getResourceFrameTrack,
        getState,
        mainThreadIndex,
        resourceThreadIndex,
      } = setup();
      // At first, make sure the main thread is selected.
      expect(getFirstSelectedThreadIndex(getState())).toBe(mainThreadIndex);

      // 1. Open the panel.
      fireFullClick(getResourcesPanelHeader());
      // 2. Select the reource track.
      fireFullClick(ensureExists(getResourceFrameTrack()));
      // Selected thread should be the resource now.
      expect(getFirstSelectedThreadIndex(getState())).toBe(resourceThreadIndex);

      // 3. Close the panel.
      fireFullClick(getResourcesPanelHeader());
      // Now the main thread should be selected again.
      expect(getFirstSelectedThreadIndex(getState())).toBe(mainThreadIndex);
    });
  });

  describe('ActiveTabResourceTrack', function () {
    function setup() {
      const { profile, ...pageInfo } = addActiveTabInformationToProfile(
        getProfileWithNiceTracks()
      );
      // Setting the threads with the following relationship:
      // Page #1 (thread #0)
      // |- Page #2 (thread #1)
      //    |- Page #3 (thread #2)
      const threadIndex = 2;
      profile.threads[0].frameTable.innerWindowID[0] =
        pageInfo.parentInnerWindowIDsWithChildren;
      profile.threads[1].frameTable.innerWindowID[0] =
        pageInfo.iframeInnerWindowIDsWithChild;
      profile.threads[threadIndex].frameTable.innerWindowID[0] =
        pageInfo.firstTabInnerWindowIDs[2];
      profile.threads[threadIndex].name = 'GeckoMain';
      profile.threads[threadIndex].isMainThread = true;
      const store = storeWithProfile(profile);
      store.dispatch(
        changeTimelineTrackOrganization({
          type: 'active-tab',
          tabID: pageInfo.firstTabTabID,
        })
      );
      const { getState, dispatch } = store;
      const resourceTracks = getActiveTabResourceTracks(getState());
      const trackIndex = 1;

      // WithSize uses requestAnimationFrame
      const flushRafCalls = mockRaf();
      const renderResult = render(
        <Provider store={store}>
          <TimelineActiveTabResourceTrack
            resourceTrack={resourceTracks[1]}
            trackIndex={trackIndex}
            setInitialSelected={() => {}}
          />
        </Provider>
      );
      flushRafCalls();

      const { container } = renderResult;
      const resourcePage = ensureExists(profile.pages)[2];
      const getResourceFrameTrackLabel = () =>
        screen.getByText(resourcePage.url);
      const getResourceTrackRow = () =>
        ensureExists(
          container.querySelector('.timelineTrackResourceRow'),
          `Couldn't find the track resource row with selector .timelineTrackResourceRow`
        );
      const isResourceTrackOpen = () =>
        getResourceTrackRow().classList.contains('opened');

      return {
        ...renderResult,
        ...pageInfo,
        dispatch,
        getState,
        profile,
        store,
        threadIndex,
        getResourceFrameTrackLabel,
        getResourceTrackRow,
        resourcePage,
        isResourceTrackOpen,
      };
    }

    describe('with a thread/sub-frame track', function () {
      it('matches the snapshot of a resource track', () => {
        const { container } = setup();
        expect(container.firstChild).toMatchSnapshot();
      });

      it('has the correct track name', function () {
        const { resourcePage } = setup();
        expect(screen.getByText(resourcePage.url)).toBeInTheDocument();
      });

      it('starts out not being selected', function () {
        const { getState, threadIndex } = setup();
        expect(getFirstSelectedThreadIndex(getState())).not.toBe(threadIndex);
      });

      it('can select a thread by clicking the label', () => {
        const { getState, getResourceFrameTrackLabel, threadIndex } = setup();
        expect(getFirstSelectedThreadIndex(getState())).not.toBe(threadIndex);
        fireFullClick(getResourceFrameTrackLabel());
        expect(getFirstSelectedThreadIndex(getState())).toBe(threadIndex);
      });

      it('can select a thread by clicking the row', () => {
        const { getState, getResourceTrackRow, threadIndex } = setup();
        expect(getFirstSelectedThreadIndex(getState())).not.toBe(threadIndex);
        fireFullClick(getResourceTrackRow());
        expect(getFirstSelectedThreadIndex(getState())).toBe(threadIndex);
      });

      it('can toggle a selected track by clicking the label', () => {
        const {
          getState,
          getResourceFrameTrackLabel,
          threadIndex,
          isResourceTrackOpen,
        } = setup();
        expect(getFirstSelectedThreadIndex(getState())).not.toBe(threadIndex);
        expect(isResourceTrackOpen()).toBe(false);
        fireFullClick(getResourceFrameTrackLabel());
        expect(getFirstSelectedThreadIndex(getState())).toBe(threadIndex);
        expect(isResourceTrackOpen()).toBe(true);
      });

      it('does not toggle a selected track by clicking other part of the track except label', () => {
        const {
          getState,
          getResourceTrackRow,
          threadIndex,
          isResourceTrackOpen,
        } = setup();
        expect(getFirstSelectedThreadIndex(getState())).not.toBe(threadIndex);
        expect(isResourceTrackOpen()).toBe(false);
        fireFullClick(getResourceTrackRow());
        expect(getFirstSelectedThreadIndex(getState())).toBe(threadIndex);
        expect(isResourceTrackOpen()).toBe(false);
      });
    });
  });
});
