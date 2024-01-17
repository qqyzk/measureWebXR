/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { unserializeProfileOfArbitraryFormat } from '../../profile-logic/process-profile';
import { isPerfScriptFormat } from '../../profile-logic/import/linux-perf';
import { GECKO_PROFILE_VERSION } from '../../app-logic/constants';
import type {
  TracingEventUnion,
  CpuProfileEvent,
} from '../../profile-logic/import/chrome';
import type { Profile } from 'firefox-profiler/types';

import { TextDecoder } from 'util';

beforeAll(function () {
  if ((window: any).TextDecoder) {
    throw new Error('A TextDecoder was already on the window object.');
  }
  (window: any).TextDecoder = TextDecoder;
});

afterAll(async function () {
  delete (window: any).TextDecoder;
});

function checkProfileContainsUniqueTid(profile: Profile) {
  const foundTids = new Set();

  for (const thread of profile.threads) {
    const { tid } = thread;
    if (tid === undefined) {
      throw new Error('Found an undefined tid!');
    }

    if (foundTids.has(tid)) {
      console.error(`Found a duplicate tid ${tid}!`);
    }

    foundTids.add(tid);
  }
}

describe('converting Linux perf profile', function () {
  async function loadProfile(filename: string): Promise<Profile> {
    const fs = require('fs');
    const zlib = require('zlib');
    const buffer = fs.readFileSync(filename);
    const decompressedArrayBuffer = zlib.gunzipSync(buffer);
    const text = decompressedArrayBuffer.toString('utf8');
    const profile = await unserializeProfileOfArbitraryFormat(text);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }
    return profile;
  }

  it('should not detect a JSON profile as perf script', function () {
    expect(
      isPerfScriptFormat('{"meta": {"product": "Cool stuff 123 456:"}}')
    ).toBe(false);
  });

  it('should import a perf profile', async function () {
    const profile = await loadProfile(
      'src/test/fixtures/upgrades/test.perf.gz'
    );
    expect(profile.meta.version).toEqual(GECKO_PROFILE_VERSION);
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });

  it('should import a simple perf profile', async function () {
    const profile = await loadProfile(
      'src/test/fixtures/upgrades/simple-perf.txt.gz'
    );
    expect(profile.meta.version).toEqual(GECKO_PROFILE_VERSION);
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });

  it('should import a perf profile of gzip', async function () {
    const profile = await loadProfile(
      'src/test/fixtures/upgrades/gzip.perf.gz'
    );
    expect(profile.meta.version).toEqual(GECKO_PROFILE_VERSION);
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });

  it('should import a perf profile of graphviz with a header', async function () {
    const profile = await loadProfile(
      'src/test/fixtures/upgrades/graphviz.perf.gz'
    );
    expect(profile.meta.version).toEqual(GECKO_PROFILE_VERSION);
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });
});

describe('converting dhat profiles', function () {
  it('should import a dhat profile', async function () {
    const fs = require('fs');
    const zlib = require('zlib');
    const buffer = fs.readFileSync('src/test/fixtures/upgrades/dhat.json.gz');
    const decompressedArrayBuffer = zlib.gunzipSync(buffer);
    const text = decompressedArrayBuffer.toString('utf8');
    const profile = await unserializeProfileOfArbitraryFormat(text);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });
});

describe('converting Google Chrome profile', function () {
  it('successfully imports a chunked profile (one that uses Profile + ProfileChunk trace events)', async function () {
    // Mock out image loading behavior as the screenshots rely on the Image loading
    // behavior.
    jest
      .spyOn(Image.prototype, 'addEventListener')
      .mockImplementation((name: string, callback) => {
        if (name === 'load') {
          callback();
        }
      });

    const fs = require('fs');
    const zlib = require('zlib');
    const buffer = fs.readFileSync('src/test/fixtures/upgrades/test.chrome.gz');
    const decompressedArrayBuffer = zlib.gunzipSync(buffer);
    const text = decompressedArrayBuffer.toString('utf8');
    const profile = await unserializeProfileOfArbitraryFormat(text);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });

  it('successfully imports a non-chunked profile (one that uses a CpuProfile trace event)', async function () {
    // As in the previous test, mock out image loading behavior as the screenshots
    // rely on the Image loading behavior.
    jest
      .spyOn(Image.prototype, 'addEventListener')
      .mockImplementation((name: string, callback) => {
        if (name === 'load') {
          callback();
        }
      });

    const fs = require('fs');
    const buffer = fs.readFileSync(
      'src/test/fixtures/upgrades/test.chrome-unchunked.json'
    );
    const text = buffer.toString('utf8');
    const profile = await unserializeProfileOfArbitraryFormat(text);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });

  it('successfully imports a single CpuProfile, e.g. from node', async function () {
    const fs = require('fs');
    let cpuProfile: CpuProfileEvent | void;
    {
      // Load the existing saved profile, but then find a single CpuProfile entry in it.

      const buffer = fs.readFileSync(
        'src/test/fixtures/upgrades/test.chrome-unchunked.json'
      );
      const events: TracingEventUnion[] = JSON.parse(buffer.toString('utf8'));

      // Use a for loop to look this up, as Flow is happier than a .find().
      for (const event of events) {
        if (event.name === 'CpuProfile') {
          cpuProfile = event;
          break;
        }
      }

      if (!cpuProfile) {
        throw new Error('Could not find a CPU profile');
      }
    }

    // Now use the single CpuProfile to test that we can convert a node-like export
    // format.
    const text = JSON.stringify(cpuProfile.args.data.cpuProfile);
    const profile = await unserializeProfileOfArbitraryFormat(text);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }

    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });
});

describe('converting ART trace', function () {
  it('successfully imports a non-streaming ART trace', async function () {
    const fs = require('fs');
    const zlib = require('zlib');
    const buffer = fs.readFileSync(
      'src/test/fixtures/upgrades/art-trace-regular.trace.gz'
    );
    const arrayBuffer = zlib.gunzipSync(buffer).buffer;
    const profile = await unserializeProfileOfArbitraryFormat(arrayBuffer);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });

  it('successfully imports a streaming ART trace', async function () {
    const fs = require('fs');
    const zlib = require('zlib');
    const buffer = fs.readFileSync(
      'src/test/fixtures/upgrades/art-trace-streaming.trace.gz'
    );
    const arrayBuffer = zlib.gunzipSync(buffer).buffer;
    const profile = await unserializeProfileOfArbitraryFormat(arrayBuffer);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });
});
