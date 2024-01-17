/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Provider } from 'react-redux';

import {
  render,
  fireEvent,
  screen,
} from 'firefox-profiler/test/fixtures/testing-library';
import { FilterNavigatorBar } from 'firefox-profiler/components/shared/FilterNavigatorBar';
import { ProfileFilterNavigator } from '../../components/app/ProfileFilterNavigator';
import * as ProfileView from '../../actions/profile-view';
import * as ReceiveProfile from '../../actions/receive-profile';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';

describe('shared/FilterNavigatorBar', () => {
  it(`pops the item unless the last one is clicked`, () => {
    const onPop = jest.fn();
    render(
      <FilterNavigatorBar
        className=""
        items={['foo', 'bar']}
        selectedItem={2}
        onPop={onPop}
      />
    );

    // We don't use getByRole because this isn't a button.
    const lastElement = screen.getByText('bar');
    fireEvent.click(lastElement);
    expect(onPop).not.toHaveBeenCalled();

    const firstElement = screen.getByRole('button', { name: 'foo' });
    fireEvent.click(firstElement);
    expect(onPop).toHaveBeenCalledWith(0);
  });

  it(`pops the last item if there's an uncommited item`, () => {
    const onPop = jest.fn();
    render(
      <FilterNavigatorBar
        className=""
        items={['foo', 'bar']}
        selectedItem={2}
        uncommittedItem="baz"
        onPop={onPop}
      />
    );

    // We don't use getByRole because this isn't a button.
    const lastElement = screen.getByText('bar');
    fireEvent.click(lastElement);
    expect(onPop).toHaveBeenCalledWith(1);
  });
});

describe('app/ProfileFilterNavigator', () => {
  const tabID = 123123;
  function setup() {
    const { profile } = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  C  H
      D  F  I
      E  G
      `);
    // Add page for active tab.
    profile.pages = [
      {
        tabID: tabID,
        innerWindowID: 1,
        url: 'https://developer.mozilla.org/en-US/',
        embedderInnerWindowID: 0,
      },
    ];
    profile.meta.configuration = {
      threads: [],
      features: [],
      capacity: 1000000,
      activeTabID: tabID,
    };

    // Change the root range for testing.
    const samples = profile.threads[0].samples;
    samples.time[samples.length - 1] = 50;

    const store = storeWithProfile(profile);
    const renderResult = render(
      <Provider store={store}>
        <ProfileFilterNavigator />
      </Provider>
    );

    return {
      ...store,
      ...renderResult,
    };
  }

  it('renders ProfileFilterNavigator properly', () => {
    const { container, dispatch } = setup();
    // Just root range
    expect(container.firstChild).toMatchSnapshot();

    // With committed range
    dispatch(ProfileView.commitRange(0, 40));
    expect(container.firstChild).toMatchSnapshot();

    // With preview selection
    dispatch(
      ProfileView.updatePreviewSelection({
        hasSelection: true,
        isModifying: false,
        selectionStart: 10,
        selectionEnd: 10.1,
      })
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('displays the "Full Range" text as its first element', () => {
    const { getByText } = setup();
    expect(getByText(/Full Range/)).toBeInTheDocument();
  });

  it('renders the site hostname as its first element in the single tab view', () => {
    const { dispatch, container } = setup();
    dispatch(
      ReceiveProfile.changeTimelineTrackOrganization({
        type: 'active-tab',
        tabID,
      })
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('displays the site hostname as its first element in the single tab view', () => {
    const { dispatch, queryByText, getByText } = setup();
    dispatch(
      ReceiveProfile.changeTimelineTrackOrganization({
        type: 'active-tab',
        tabID,
      })
    );
    expect(queryByText(/Full Range/)).not.toBeInTheDocument();
    // Using regexp because searching for a partial text.
    expect(getByText(/developer\.mozilla\.org/)).toBeInTheDocument();
  });
});
