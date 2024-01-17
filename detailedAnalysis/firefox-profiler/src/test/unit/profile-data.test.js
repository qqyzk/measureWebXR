/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import {
  symbolicateProfile,
  applySymbolicationStep,
} from '../../profile-logic/symbolication';
import { AddressLocator } from '../../profile-logic/address-locator';
import {
  processGeckoProfile,
  processGeckoOrDevToolsProfile,
} from '../../profile-logic/process-profile';
import {
  getCallNodeInfo,
  invertCallstack,
  filterThreadByImplementation,
  getCallNodePathFromIndex,
  getSampleIndexClosestToStartTime,
  convertStackToCallNodeAndCategoryPath,
  getSampleIndexToCallNodeIndex,
  getCallNodeIndexFromPath,
  getTreeOrderComparator,
  getSamplesSelectedStates,
  extractProfileFilterPageData,
  findAddressProofForFile,
  calculateFunctionSizeLowerBound,
  getNativeSymbolsForCallNode,
  getNativeSymbolInfo,
} from '../../profile-logic/profile-data';
import { resourceTypes } from '../../profile-logic/data-structures';
import {
  createGeckoProfile,
  createGeckoProfileWithJsTimings,
  createGeckoSubprocessProfile,
} from '.././fixtures/profiles/gecko-profile';
import { UniqueStringArray } from '../../utils/unique-string-array';
import { FakeSymbolStore } from '../fixtures/fake-symbol-store';
import { sortDataTable } from '../../utils/data-table-utils';
import { ensureExists } from '../../utils/flow';
import getCallNodeProfile from '../fixtures/profiles/call-nodes';
import {
  getProfileFromTextSamples,
  getJsTracerTable,
} from '../fixtures/profiles/processed-profile';
import {
  funcHasDirectRecursiveCall,
  funcHasIndirectRecursiveCall,
} from '../../profile-logic/transforms';

import type { Thread, IndexIntoStackTable } from 'firefox-profiler/types';

describe('unique-string-array', function () {
  const u = new UniqueStringArray(['foo', 'bar', 'baz']);

  it('should return the right strings', function () {
    expect(u.getString(0)).toEqual('foo');
    expect(u.getString(1)).toEqual('bar');
    expect(u.getString(2)).toEqual('baz');
  });

  it('should return the correct index for existing strings', function () {
    expect(u.indexForString('foo')).toEqual(0);
    expect(u.indexForString('bar')).toEqual(1);
    expect(u.indexForString('baz')).toEqual(2);
  });

  it('should return a new index for a new string', function () {
    expect(u.indexForString('qux')).toEqual(3);
    expect(u.indexForString('qux')).toEqual(3);
    expect(u.indexForString('hello')).toEqual(4);
    expect(u.indexForString('bar')).toEqual(1);
    expect(u.indexForString('qux')).toEqual(3);
    expect(u.getString(3)).toEqual('qux');
    expect(u.getString(4)).toEqual('hello');
  });
});

describe('data-table-utils', function () {
  describe('sortDataTable', function () {
    const originalDataTable = {
      length: 6,
      word: ['a', 'is', 'now', 'This', 'array', 'sorted'],
      order: [13, 0.7, 2, -0.2, 100, 20.1],
      wordLength: [1, 2, 3, 4, 5, 6],
    };
    const dt = JSON.parse(JSON.stringify(originalDataTable));

    it('test preparation', function () {
      // verify copy
      expect(dt).not.toBe(originalDataTable);
      expect(dt).toEqual(originalDataTable);
      expect(dt.word.map((w) => w.length)).toEqual(dt.wordLength);
    });

    it('should sort this data table by order', function () {
      // sort by order
      sortDataTable(dt, dt.order, (a, b) => a - b);

      expect(dt.length).toEqual(originalDataTable.length);
      expect(dt.word.length).toEqual(originalDataTable.length);
      expect(dt.order.length).toEqual(originalDataTable.length);
      expect(dt.wordLength.length).toEqual(originalDataTable.length);
      expect(dt.word.map((w) => w.length)).toEqual(dt.wordLength);
      expect(dt.order).toEqual([...dt.order].sort((a, b) => a - b));
      expect(dt.word.join(' ')).toEqual('This is now a sorted array');
    });

    it('should sort this data table by wordLength', function () {
      // sort by wordLength
      sortDataTable(dt, dt.wordLength, (a, b) => a - b);
      expect(dt).toEqual(originalDataTable);
    });

    const differentDataTable = {
      length: 7,
      keyColumn: [1, 2, 3, 5, 6, 4, 7],
    };

    it('should sort this other data table', function () {
      sortDataTable(
        differentDataTable,
        differentDataTable.keyColumn,
        (a, b) => a - b
      );
      expect(differentDataTable.keyColumn).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });
  });
});

// TODO: Move this test section to process-profile.test.js?
describe('process-profile', function () {
  describe('processGeckoProfile', function () {
    const profile = processGeckoProfile(createGeckoProfile());

    it('should have three threads', function () {
      expect(profile.threads.length).toEqual(3);
    });

    it('should have a profile-wide libs property', function () {
      expect('libs' in profile).toBeTruthy();
    });

    it('should have threads that are objects of the right shape', function () {
      for (const thread of profile.threads) {
        expect(typeof thread).toEqual('object');
        expect('libs' in thread).toBeFalsy();
        expect('samples' in thread).toBeTruthy();
        expect('stackTable' in thread).toBeTruthy();
        expect('frameTable' in thread).toBeTruthy();
        expect('markers' in thread).toBeTruthy();
        expect('stringTable' in thread).toBeTruthy();
        expect('funcTable' in thread).toBeTruthy();
        expect('resourceTable' in thread).toBeTruthy();
      }
    });

    it('should have reasonable debugName fields on each library', function () {
      expect(profile.libs.length).toBe(2);
      expect(profile.libs[0].debugName).toEqual('firefox');
      expect(profile.libs[1].debugName).toEqual('firefox-webcontent');
      // The other libraries aren't used, so they should be culled from the
      // processed profile.
    });

    it('should have reasonable breakpadId fields on each library', function () {
      for (const lib of profile.libs) {
        expect('breakpadId' in lib).toBeTruthy();
        expect(lib.breakpadId.length).toEqual(33);
        expect(lib.breakpadId).toEqual(lib.breakpadId.toUpperCase());
      }
    });

    it('should shift the content process by 1 second', function () {
      const thread0 = profile.threads[0];
      const thread2 = profile.threads[2];

      // Should be Content, but modified by workaround for bug 1322471.
      expect(thread2.name).toEqual('GeckoMain');

      expect(thread0.samples.time[0]).toEqual(0);
      expect(thread0.samples.time[1]).toEqual(1);

      // 1 second later than the same samples in the main process because the
      // content process' start time is 1s later.
      expect(thread2.samples.time[0]).toEqual(1000);
      expect(thread2.samples.time[1]).toEqual(1001);

      // Now about markers
      expect(thread0.markers.endTime[0]).toEqual(1);
      expect(thread0.markers.startTime[1]).toEqual(2);
      expect(thread0.markers.startTime[2]).toEqual(3);
      expect(thread0.markers.startTime[3]).toEqual(4);
      expect(thread0.markers.endTime[4]).toEqual(5);

      // If this assertion fails with the value 11, then marker sorting is broken.
      expect(thread0.markers.startTime[6]).toEqual(9);
      expect(thread0.markers.endTime[7]).toEqual(10);

      // 1 second later than the same markers in the main process.
      expect(thread2.markers.endTime[0]).toEqual(1001);
      expect(thread2.markers.startTime[1]).toEqual(1002);
      expect(thread2.markers.startTime[2]).toEqual(1003);
      expect(thread2.markers.startTime[3]).toEqual(1004);
      expect(thread2.markers.endTime[4]).toEqual(1005);

      expect(thread2.markers.startTime[6]).toEqual(1009);
      expect(thread2.markers.endTime[7]).toEqual(1010);

      // TODO: also shift the samples inside marker callstacks
    });

    it('should create one function per frame, except for extra frames from return address nudging', function () {
      const thread = profile.threads[0];
      expect(thread.frameTable.length).toEqual(9);
      expect('location' in thread.frameTable).toBeFalsy();
      expect('func' in thread.frameTable).toBeTruthy();
      expect('resource' in thread.funcTable).toBeTruthy();
      expect(thread.funcTable.length).toEqual(7);
      expect(thread.frameTable.func[0]).toEqual(0);
      expect(thread.frameTable.func[1]).toEqual(1);
      expect(thread.frameTable.func[2]).toEqual(2);
      expect(thread.frameTable.func[3]).toEqual(3);
      expect(thread.frameTable.func[4]).toEqual(4);
      expect(thread.frameTable.func[5]).toEqual(5);
      expect(thread.frameTable.func[6]).toEqual(6);
      expect(thread.frameTable.func[7]).toEqual(2);
      expect(thread.frameTable.func[8]).toEqual(1);
      expect(thread.frameTable.address[0]).toEqual(-1);
      // The next two addresses were return addresses which were "nudged"
      // by one byte to point into the calling instruction.
      expect(thread.frameTable.address[1]).toEqual(0xf83);
      expect(thread.frameTable.address[2]).toEqual(0x1a44);
      expect(thread.frameTable.address[3]).toEqual(-1);
      expect(thread.frameTable.address[4]).toEqual(-1);
      expect(thread.frameTable.address[5]).toEqual(0x1bcd);
      expect(thread.frameTable.address[6]).toEqual(0x1bce);
      // Here are the non-nudged addresses for when they were sampled directly.
      expect(thread.frameTable.address[7]).toEqual(0x1a45);
      expect(thread.frameTable.address[8]).toEqual(0xf84);
      expect(thread.funcTable.name[0]).toEqual(0);
      expect(thread.funcTable.name[1]).toEqual(1);
      expect(thread.funcTable.name[2]).toEqual(2);
      expect(thread.funcTable.name[3]).toEqual(3);
      expect(thread.stringTable.getString(thread.funcTable.name[4])).toEqual(
        'frobnicate'
      );
      const chromeStringIndex = thread.funcTable.fileName[4];
      if (typeof chromeStringIndex !== 'number') {
        throw new Error('chromeStringIndex must be a number');
      }
      expect(thread.stringTable.getString(chromeStringIndex)).toEqual(
        'chrome://blargh'
      );
      expect(thread.funcTable.lineNumber[4]).toEqual(34);
      expect(thread.funcTable.columnNumber[4]).toEqual(35);
    });

    it('nudges return addresses but not sampled instruction pointer values', function () {
      const profile = processGeckoProfile(createGeckoProfile());
      const thread = profile.threads[0];
      function getFrameAddressesForSampleIndex(sample) {
        const addresses = [];
        let stack = thread.samples.stack[sample];
        while (stack !== null) {
          addresses.push(
            thread.frameTable.address[thread.stackTable.frame[stack]]
          );
          stack = thread.stackTable.prefix[stack];
        }
        addresses.reverse();
        return addresses;
      }

      expect(getFrameAddressesForSampleIndex(0)).toEqual([-1, 0xf84]);
      // 0xf84 from the caller has been nudged to 0xf83
      expect(getFrameAddressesForSampleIndex(1)).toEqual([-1, 0xf83, 0x1a45]);
    });

    it('should create no entries in nativeSymbols before symbolication', function () {
      const thread = profile.threads[0];
      expect(thread.frameTable.length).toEqual(9);
      expect('nativeSymbol' in thread.frameTable).toBeTruthy();
      expect(thread.nativeSymbols.length).toEqual(0);
      expect(thread.frameTable.nativeSymbol[0]).toEqual(null);
      expect(thread.frameTable.nativeSymbol[1]).toEqual(null);
      expect(thread.frameTable.nativeSymbol[2]).toEqual(null);
      expect(thread.frameTable.nativeSymbol[3]).toEqual(null);
      expect(thread.frameTable.nativeSymbol[4]).toEqual(null);
      expect(thread.frameTable.nativeSymbol[5]).toEqual(null);
      expect(thread.frameTable.nativeSymbol[6]).toEqual(null);
      expect(thread.frameTable.nativeSymbol[7]).toEqual(null);
      expect(thread.frameTable.nativeSymbol[8]).toEqual(null);
    });

    it('should create one resource per used library', function () {
      const thread = profile.threads[0];
      expect(thread.resourceTable.length).toEqual(3);
      expect(thread.resourceTable.type[0]).toEqual(resourceTypes.addon);
      expect(thread.resourceTable.type[1]).toEqual(resourceTypes.library);
      expect(thread.resourceTable.type[2]).toEqual(resourceTypes.url);
      const [name0, name1, name2] = thread.resourceTable.name;
      expect(thread.stringTable.getString(name0)).toEqual(
        'Extension "Form Autofill" (ID: formautofill@mozilla.org)'
      );
      expect(thread.stringTable.getString(name1)).toEqual('firefox');
      expect(thread.stringTable.getString(name2)).toEqual('chrome://blargh');
    });
  });

  describe('JS tracer', function () {
    it('does not have JS tracer information by default', function () {
      const profile = processGeckoProfile(createGeckoProfile());
      expect(profile.threads[0].jsTracer).toBe(undefined);
    });

    it('processes JS tracer and offsets the timestamps', function () {
      const geckoProfile = createGeckoProfile();
      let timestampOffsetMs = 33;

      {
        // Build the custom thread with JS tracer information. The startTime is offset
        // from the parent process.
        const geckoSubprocess = createGeckoSubprocessProfile(geckoProfile);
        const childProcessThread = geckoSubprocess.threads[0];
        const stringTable = new UniqueStringArray();
        const jsTracer = getJsTracerTable(stringTable, [
          ['jsTracerA', 0, 10],
          ['jsTracerB', 1, 9],
          ['jsTracerC', 2, 8],
        ]);
        childProcessThread.jsTracerEvents = jsTracer;
        geckoSubprocess.jsTracerDictionary = stringTable._array;
        geckoSubprocess.meta.startTime += timestampOffsetMs;
        // Update the timestampOffset taking into account the subprocess offset
        timestampOffsetMs =
          geckoSubprocess.meta.startTime - geckoProfile.meta.startTime;
        geckoProfile.processes.push(geckoSubprocess);
      }

      const timestampOffsetMicro = timestampOffsetMs * 1000;

      // Process the profile, and grab the threads we are interested in.
      const processedProfile = processGeckoProfile(geckoProfile);
      const childProcessThread = ensureExists(
        processedProfile.threads.find((thread) => thread.jsTracer),
        'Could not find the thread with the JS tracer information'
      );
      const processedJsTracer = ensureExists(
        childProcessThread.jsTracer,
        'The JS tracer table was not found on the subprocess'
      );

      // Check that the values are correct from the test defined data.
      expect(
        processedJsTracer.events.map((index) =>
          childProcessThread.stringTable.getString(index)
        )
      ).toEqual(['jsTracerA', 'jsTracerB', 'jsTracerC']);
      expect(processedJsTracer.durations).toEqual([10000, 8000, 6000]);
      expect(processedJsTracer.timestamps).toEqual([
        0 + timestampOffsetMicro,
        1000 + timestampOffsetMicro,
        2000 + timestampOffsetMicro,
      ]);
    });
  });

  describe('DevTools profiles', function () {
    it('should process correctly', function () {
      // Mock out a DevTools profile.
      const profile = processGeckoOrDevToolsProfile({
        label: null,
        duration: null,
        markers: null,
        frames: null,
        memory: null,
        ticks: null,
        allocations: null,
        profile: createGeckoProfile(),
        configuration: null,
        systemHost: null,
        systemClient: null,
        fileType: null,
        version: null,
      });
      expect(profile.threads.length).toEqual(3);
    });
  });

  describe('extensions metadata', function () {
    it('should be processed correctly', function () {
      const geckoProfile = createGeckoProfile();
      geckoProfile.meta.extensions = {
        schema: {
          id: 0,
          name: 1,
          baseURL: 2,
        },
        data: [
          [
            'geckoprofiler@mozilla.com',
            'Gecko Profiler',
            'moz-extension://bf3bb73c-919c-4fef-95c4-070a19fdaf85/',
          ],
          [
            'screenshots@mozilla.org',
            'Firefox Screenshots',
            'moz-extension://fa2edf9c-c45f-4445-b819-c09e3f2d58d5/',
          ],
        ],
      };

      const profile = processGeckoProfile(geckoProfile);
      expect(profile.meta.extensions).toEqual({
        baseURL: [
          'moz-extension://bf3bb73c-919c-4fef-95c4-070a19fdaf85/',
          'moz-extension://fa2edf9c-c45f-4445-b819-c09e3f2d58d5/',
        ],
        id: ['geckoprofiler@mozilla.com', 'screenshots@mozilla.org'],
        name: ['Gecko Profiler', 'Firefox Screenshots'],
        length: 2,
      });
    });

    it('should be handled correctly if missing', function () {
      const geckoProfile = createGeckoProfile();
      delete geckoProfile.meta.extensions;

      const profile = processGeckoProfile(geckoProfile);
      expect(profile.meta.extensions).toEqual({
        baseURL: [],
        id: [],
        name: [],
        length: 0,
      });
    });
  });
});

describe('profile-data', function () {
  describe('createCallNodeTableAndFixupSamples', function () {
    const profile = processGeckoProfile(createGeckoProfile());
    const defaultCategory = ensureExists(
      profile.meta.categories,
      'Expected to find categories'
    ).findIndex((c) => c.name === 'Other');
    const thread = profile.threads[0];
    const { callNodeTable } = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable,
      defaultCategory
    );

    it('should create one callNode per original stack', function () {
      // After nudgeReturnAddresses, the stack table now has 8 entries.
      expect(thread.stackTable.length).toEqual(8);
      // But the call node table only has 5, same as the original stack table.
      // That's because, whenever nudgeReturnAddresses duplicates frames (one nudged
      // and one non-nudged), the two frames still share the same func, so the call
      // node table respects that func sharing.
      expect(callNodeTable.length).toEqual(5);
      expect('prefix' in callNodeTable).toBeTruthy();
      expect('func' in callNodeTable).toBeTruthy();
      expect(callNodeTable.func[0]).toEqual(0);
      expect(callNodeTable.func[1]).toEqual(1);
      expect(callNodeTable.func[2]).toEqual(2);
      expect(callNodeTable.func[3]).toEqual(3);
    });
  });

  function _getStackList(
    thread: Thread,
    stackIndex: IndexIntoStackTable | null
  ) {
    if (typeof stackIndex !== 'number') {
      throw new Error('stackIndex must be a number');
    }
    const { prefix } = thread.stackTable;
    const stackList = [];
    let nextStack = stackIndex;
    while (nextStack !== null) {
      if (typeof nextStack !== 'number') {
        throw new Error('nextStack must be a number');
      }

      stackList.unshift(nextStack);
      nextStack = prefix[nextStack];
    }
    return stackList;
  }

  describe('getCallNodeInfo', function () {
    const {
      meta,
      threads: [thread],
    } = getCallNodeProfile();
    const defaultCategory = ensureExists(
      meta.categories,
      'Expected to find categories'
    ).findIndex((c) => c.name === 'Other');
    const { callNodeTable, stackIndexToCallNodeIndex } = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable,
      defaultCategory
    );
    const stack0 = thread.samples.stack[0];
    const stack1 = thread.samples.stack[1];
    if (stack0 === null || stack1 === null) {
      throw new Error('Stacks must not be null.');
    }
    const originalStackListA = _getStackList(thread, stack0);
    const originalStackListB = _getStackList(thread, stack1);
    const mergedFuncListA = getCallNodePathFromIndex(
      stackIndexToCallNodeIndex[stack0],
      callNodeTable
    );
    const mergedFuncListB = getCallNodePathFromIndex(
      stackIndexToCallNodeIndex[stack1],
      callNodeTable
    );

    it('starts with a fully unduplicated set stack frames', function () {
      /**
       * Assert this original structure:
       *
       *            stack0 (funcA)
       *                 |
       *                 v
       *            stack1 (funcB)
       *                 |
       *                 v
       *            stack2 (funcC)
       *            /            \
       *           V              V
       *    stack3 (funcD)     stack5 (funcD)
       *         |                  |
       *         v                  V
       *    stack4 (funcE)     stack6 (funcF)
       *
       *       ^sample 0          ^sample 1
       */

      expect(thread.stackTable.length).toEqual(7);
      expect(originalStackListA).toEqual([0, 1, 2, 3, 4]);
      expect(originalStackListB).toEqual([0, 1, 2, 5, 6]);
    });

    it('creates a callNodeTable with merged stacks that share functions', function () {
      /**
       * This structure represents the desired de-duplication.
       *
       *            callNode0 (funcA)
       *                 |
       *                 v
       *            callNode1 (funcB)
       *                 |
       *                 v
       *            callNode2 (funcC)
       *                 |
       *                 v
       *            callNode3 (funcD)
       *          /               \
       *         V                 V
       * callNode4 (funcE)       callNode5 (funcF)
       *
       *       ^sample 0          ^sample 1
       */
      expect(mergedFuncListA).toEqual([0, 1, 2, 3, 4]);
      expect(mergedFuncListB).toEqual([0, 1, 2, 3, 5]);
      expect(callNodeTable.length).toEqual(6);
    });
  });
});

describe('symbolication', function () {
  describe('AddressLocator', function () {
    const libs = [
      { start: 0, end: 0x20, name: 'first' },
      { start: 0x20, end: 0x40, name: 'second' },
      { start: 0x40, end: 0x50, name: 'third' },
      { start: 0x60, end: 0x80, name: 'fourth' },
      { start: 0x80, end: 0xa0, name: 'fifth' },
      { start: 0xfffff80130000000, end: 0xfffff80131046000, name: 'kernel' },
    ].map((lib) => {
      // Make sure our fixtures are correctly typed.
      return Object.assign({}, lib, {
        offset: 0,
        arch: '',
        path: '',
        debugName: '',
        debugPath: '',
        breakpadId: '',
      });
    });

    // Help flow out here.
    function getLibName(lib) {
      if (lib) {
        return lib.name;
      }
      return null;
    }

    const locator = new AddressLocator(libs);

    it('should return the first library for addresses inside the first library', function () {
      expect(getLibName(locator.locateAddress('0x0').lib)).toEqual('first');
      expect(getLibName(locator.locateAddress('0x10').lib)).toEqual('first');
      expect(getLibName(locator.locateAddress('0x1f').lib)).toEqual('first');
    });

    it('should return the second library for addresses inside the second library', function () {
      expect(getLibName(locator.locateAddress('0x20').lib)).toEqual('second');
      expect(getLibName(locator.locateAddress('0x21').lib)).toEqual('second');
      expect(getLibName(locator.locateAddress('0x2b').lib)).toEqual('second');
      expect(getLibName(locator.locateAddress('0x3f').lib)).toEqual('second');
    });

    it('should return the third library for addresses inside the third library', function () {
      expect(getLibName(locator.locateAddress('0x40').lib)).toEqual('third');
      expect(getLibName(locator.locateAddress('0x41').lib)).toEqual('third');
      expect(getLibName(locator.locateAddress('0x4c').lib)).toEqual('third');
      expect(getLibName(locator.locateAddress('0x4f').lib)).toEqual('third');
    });

    it('should return correct relative addresses for large absolute addresses', function () {
      expect(
        getLibName(locator.locateAddress('0xfffff80130004123').lib)
      ).toEqual('kernel');
      // Regular JS number subtraction would give the wrong value:
      // (0xfffff80130004123 - 0xfffff80130000000).toString(16) === "4000"
      expect(
        locator.locateAddress('0xfffff80130004123').relativeAddress
      ).toEqual(0x4123);
    });

    it('should return no library when outside or in holes', function () {
      expect(locator.locateAddress('0xa0').lib).toEqual(null);
      expect(locator.locateAddress('0x100').lib).toEqual(null);
      expect(locator.locateAddress('0x50').lib).toEqual(null);
      expect(locator.locateAddress('0x5a').lib).toEqual(null);
      expect(locator.locateAddress('0x5f').lib).toEqual(null);
    });
  });

  describe('symbolicateProfile', function () {
    let unsymbolicatedProfile = null;
    let symbolicatedProfile = null;

    beforeAll(function () {
      unsymbolicatedProfile = processGeckoProfile(createGeckoProfile());
      const symbolTable = new Map();
      symbolTable.set(0, 'first symbol');
      symbolTable.set(0xf00, 'second symbol');
      symbolTable.set(0x1a00, 'third symbol');
      symbolTable.set(0x2000, 'last symbol');
      const symbolStore = new FakeSymbolStore(
        new Map([
          ['firefox', symbolTable],
          ['firefox-webcontent', symbolTable],
        ])
      );
      symbolicatedProfile = Object.assign({}, unsymbolicatedProfile, {
        threads: unsymbolicatedProfile.threads.slice(),
      });
      const symbolicationPromise = symbolicateProfile(
        unsymbolicatedProfile,
        symbolStore,
        (threadIndex, symbolicationStepInfo) => {
          if (!symbolicatedProfile) {
            throw new Error('symbolicatedProfile cannot be null');
          }
          symbolicatedProfile.threads[threadIndex] = applySymbolicationStep(
            symbolicatedProfile.threads[threadIndex],
            symbolicationStepInfo,
            new Map()
          );
        }
      );
      return symbolicationPromise;
    });

    it('should assign correct symbols to frames', function () {
      function functionNameForFrameInThread(thread, frameIndex) {
        const funcIndex = thread.frameTable.func[frameIndex];
        const funcNameStringIndex = thread.funcTable.name[funcIndex];
        return thread.stringTable.getString(funcNameStringIndex);
      }
      if (!unsymbolicatedProfile || !symbolicatedProfile) {
        throw new Error('Profiles cannot be null');
      }
      const symbolicatedThread = symbolicatedProfile.threads[0];
      const unsymbolicatedThread = unsymbolicatedProfile.threads[0];

      expect(functionNameForFrameInThread(unsymbolicatedThread, 1)).toEqual(
        '0x100000f84'
      );
      expect(functionNameForFrameInThread(symbolicatedThread, 1)).toEqual(
        'second symbol'
      );
      expect(functionNameForFrameInThread(unsymbolicatedThread, 2)).toEqual(
        '0x100001a45'
      );
      expect(functionNameForFrameInThread(symbolicatedThread, 2)).toEqual(
        'third symbol'
      );
    });
  });
  // TODO: check that functions are collapsed correctly
});

describe('filter-by-implementation', function () {
  const profile = processGeckoProfile(createGeckoProfileWithJsTimings());
  const defaultCategory = ensureExists(
    profile.meta.categories,
    'Expected to find categories'
  ).findIndex((c) => c.name === 'Other');
  const thread = profile.threads[0];

  function stackIsJS(filteredThread, stackIndex) {
    if (stackIndex === null) {
      throw new Error('stackIndex cannot be null');
    }
    const frameIndex = filteredThread.stackTable.frame[stackIndex];
    const funcIndex = filteredThread.frameTable.func[frameIndex];
    return filteredThread.funcTable.isJS[funcIndex];
  }

  it('will return the same thread if filtering to "all"', function () {
    expect(
      filterThreadByImplementation(thread, 'combined', defaultCategory)
    ).toEqual(thread);
  });

  it('will return only JS samples if filtering to "js"', function () {
    const jsOnlyThread = filterThreadByImplementation(
      thread,
      'js',
      defaultCategory
    );
    const nonNullSampleStacks = jsOnlyThread.samples.stack.filter(
      (stack) => stack !== null
    );
    const samplesAreAllJS = nonNullSampleStacks
      .map((stack) => stackIsJS(jsOnlyThread, stack))
      .reduce((a, b) => a && b);

    expect(samplesAreAllJS).toBe(true);
    expect(nonNullSampleStacks.length).toBe(4);
  });

  it('will return only C++ samples if filtering to "cpp"', function () {
    const cppOnlyThread = filterThreadByImplementation(
      thread,
      'cpp',
      defaultCategory
    );
    const nonNullSampleStacks = cppOnlyThread.samples.stack.filter(
      (stack) => stack !== null
    );
    const samplesAreAllJS = nonNullSampleStacks
      .map((stack) => !stackIsJS(cppOnlyThread, stack))
      .reduce((a, b) => a && b);

    expect(samplesAreAllJS).toBe(true);
    expect(nonNullSampleStacks.length).toBe(10);
  });
});

describe('get-sample-index-closest-to-time', function () {
  it('returns the correct sample index for a provided time', function () {
    const { profile } = getProfileFromTextSamples(
      Array(10).fill('A').join('  ')
    );
    const defaultCategory = ensureExists(
      profile.meta.categories,
      'Expected to find categories'
    ).findIndex((c) => c.name === 'Other');
    const thread = profile.threads[0];
    const { samples } = filterThreadByImplementation(
      thread,
      'js',
      defaultCategory
    );

    const interval = profile.meta.interval;
    expect(getSampleIndexClosestToStartTime(samples, 0, interval)).toBe(0);
    expect(getSampleIndexClosestToStartTime(samples, 0.9, interval)).toBe(0);
    expect(getSampleIndexClosestToStartTime(samples, 1.1, interval)).toBe(1);
    expect(getSampleIndexClosestToStartTime(samples, 1.5, interval)).toBe(1);
    expect(getSampleIndexClosestToStartTime(samples, 9.9, interval)).toBe(9);
    expect(getSampleIndexClosestToStartTime(samples, 100, interval)).toBe(9);
  });
});

describe('funcHasDirectRecursiveCall', function () {
  const {
    profile,
    funcNamesPerThread: [funcNames],
  } = getProfileFromTextSamples(`
    A.js
    B.js
    C.cpp
    B.js
    D.js
  `);
  const [thread] = profile.threads;

  it('correctly identifies directly recursive functions based taking into account implementation', function () {
    expect([
      funcHasDirectRecursiveCall(thread, 'combined', funcNames.indexOf('A.js')),
      funcHasDirectRecursiveCall(thread, 'combined', funcNames.indexOf('B.js')),
      funcHasDirectRecursiveCall(thread, 'js', funcNames.indexOf('B.js')),
    ]).toEqual([false, false, true]);
  });
});

describe('funcHasIndirectRecursiveCall', function () {
  it('correctly identifies directly recursive functions based taking into account implementation', function () {
    // Same test case as funcHasDirectRecursiveCall
    const {
      profile,
      funcNamesPerThread: [funcNames],
    } = getProfileFromTextSamples(`
      A.js
      B.js
      C.cpp
      B.js
      D.js
    `);
    const [thread] = profile.threads;

    expect([
      funcHasIndirectRecursiveCall(
        thread,
        'combined',
        funcNames.indexOf('A.js')
      ),
      funcHasIndirectRecursiveCall(
        thread,
        'combined',
        funcNames.indexOf('B.js')
      ),
      funcHasIndirectRecursiveCall(thread, 'js', funcNames.indexOf('B.js')),
    ]).toEqual([false, true, true]);
  });

  it('correctly identifies indirectly recursive functions based taking into account implementation', function () {
    const {
      profile,
      funcNamesPerThread: [funcNames],
    } = getProfileFromTextSamples(`
      A.js
      B.js
      C.cpp
      B.js
      D.js
      B.js
    `);
    const [thread] = profile.threads;

    expect([
      funcHasIndirectRecursiveCall(
        thread,
        'combined',
        funcNames.indexOf('B.js')
      ),
      funcHasIndirectRecursiveCall(thread, 'js', funcNames.indexOf('B.js')),
    ]).toEqual([true, true]);
  });
});

describe('convertStackToCallNodeAndCategoryPath', function () {
  it('correctly returns a call node path for a stack', function () {
    const {
      threads: [thread],
    } = getCallNodeProfile();
    const stack1 = thread.samples.stack[0];
    const stack2 = thread.samples.stack[1];
    if (stack1 === null || stack2 === null) {
      // Makes flow happy
      throw new Error("stack shouldn't be null");
    }
    let callNodePath = convertStackToCallNodeAndCategoryPath(thread, stack1);
    expect(callNodePath.map((f) => f.func)).toEqual([0, 1, 2, 3, 4]);
    callNodePath = convertStackToCallNodeAndCategoryPath(thread, stack2);
    expect(callNodePath.map((f) => f.func)).toEqual([0, 1, 2, 3, 5]);
  });
});

describe('getSamplesSelectedStates', function () {
  const {
    profile,
    funcNamesDictPerThread: [{ A, B, D, E, F }],
  } = getProfileFromTextSamples(`
     A  A  A  A  A
     B  D  B  D  D
     C  E  F  G
  `);
  const thread = profile.threads[0];
  const { callNodeTable, stackIndexToCallNodeIndex } = getCallNodeInfo(
    thread.stackTable,
    thread.frameTable,
    thread.funcTable,
    0
  );
  const sampleCallNodes = getSampleIndexToCallNodeIndex(
    thread.samples.stack,
    stackIndexToCallNodeIndex
  );

  const A_B = getCallNodeIndexFromPath([A, B], callNodeTable);
  const A_B_F = getCallNodeIndexFromPath([A, B, F], callNodeTable);
  const A_D = getCallNodeIndexFromPath([A, D], callNodeTable);
  const A_D_E = getCallNodeIndexFromPath([A, D, E], callNodeTable);

  it('determines the selection status of all the samples', function () {
    expect(
      getSamplesSelectedStates(
        callNodeTable,
        sampleCallNodes,
        sampleCallNodes,
        A_B
      )
    ).toEqual([
      'SELECTED',
      'UNSELECTED_ORDERED_AFTER_SELECTED',
      'SELECTED',
      'UNSELECTED_ORDERED_AFTER_SELECTED',
      'UNSELECTED_ORDERED_AFTER_SELECTED',
    ]);
    expect(
      getSamplesSelectedStates(
        callNodeTable,
        sampleCallNodes,
        sampleCallNodes,
        A_D
      )
    ).toEqual([
      'UNSELECTED_ORDERED_BEFORE_SELECTED',
      'SELECTED',
      'UNSELECTED_ORDERED_BEFORE_SELECTED',
      'SELECTED',
      'SELECTED',
    ]);
    expect(
      getSamplesSelectedStates(
        callNodeTable,
        sampleCallNodes,
        sampleCallNodes,
        A_B_F
      )
    ).toEqual([
      'UNSELECTED_ORDERED_BEFORE_SELECTED',
      'UNSELECTED_ORDERED_AFTER_SELECTED',
      'SELECTED',
      'UNSELECTED_ORDERED_AFTER_SELECTED',
      'UNSELECTED_ORDERED_AFTER_SELECTED',
    ]);
    expect(
      getSamplesSelectedStates(
        callNodeTable,
        sampleCallNodes,
        sampleCallNodes,
        A_D_E
      )
    ).toEqual([
      'UNSELECTED_ORDERED_BEFORE_SELECTED',
      'SELECTED',
      'UNSELECTED_ORDERED_BEFORE_SELECTED',
      'UNSELECTED_ORDERED_AFTER_SELECTED',
      'UNSELECTED_ORDERED_BEFORE_SELECTED',
    ]);
  });

  it('can sort the samples based on their selection status', function () {
    const comparator = getTreeOrderComparator(callNodeTable, sampleCallNodes);
    const samples = [4, 1, 3, 0, 2]; // some random order
    samples.sort(comparator);
    expect(samples).toEqual([0, 2, 4, 1, 3]);
    expect(comparator(0, 0)).toBe(0);
    expect(comparator(1, 1)).toBe(0);
    expect(comparator(4, 4)).toBe(0);
    expect(comparator(0, 2)).toBeLessThan(0);
    expect(comparator(2, 0)).toBeGreaterThan(0);
  });
});

describe('extractProfileFilterPageData', function () {
  const innerWindowIds = {
    mozilla: 1,
    aboutBlank: 2,
    profiler: 3,
    exampleSubFrame: 4,
    unknown: 5,
  };
  // This is the `profile.pages` array.
  const pages = [
    {
      tabID: 1111,
      innerWindowID: innerWindowIds.mozilla,
      url: 'https://www.mozilla.org',
      embedderInnerWindowID: 0,
    },
    {
      tabID: 2222,
      innerWindowID: innerWindowIds.aboutBlank,
      url: 'about:blank',
      embedderInnerWindowID: 0,
    },
    {
      tabID: 2222,
      innerWindowID: innerWindowIds.profiler,
      url: 'https://profiler.firefox.com/public/xyz',
      embedderInnerWindowID: 0,
    },
    {
      tabID: 2222,
      innerWindowID: innerWindowIds.exampleSubFrame,
      url: 'https://example.com/subframe',
      // This is a subframe of the page above.
      embedderInnerWindowID: innerWindowIds.profiler,
    },
  ];

  it('extracts the page data when there is only one relevant page', function () {
    // Adding only the https://www.mozilla.org page.
    const relevantPages = new Set([innerWindowIds.mozilla]);

    const pageData = extractProfileFilterPageData(pages, relevantPages);
    expect(pageData).toEqual({
      origin: 'https://www.mozilla.org',
      hostname: 'www.mozilla.org',
      favicon: 'https://www.mozilla.org/favicon.ico',
    });
  });

  it('extracts the page data when there are multiple relevant page', function () {
    const relevantPages = new Set([
      innerWindowIds.profiler,
      innerWindowIds.exampleSubFrame,
    ]);

    const pageData = extractProfileFilterPageData(pages, relevantPages);
    expect(pageData).toEqual({
      origin: 'https://profiler.firefox.com',
      hostname: 'profiler.firefox.com',
      favicon: 'https://profiler.firefox.com/favicon.ico',
    });
  });

  it('extracts the page data when there are multiple relevant page with about:blank', function () {
    const relevantPages = new Set([
      innerWindowIds.aboutBlank,
      innerWindowIds.profiler,
    ]);

    const pageData = extractProfileFilterPageData(pages, relevantPages);
    expect(pageData).toEqual({
      origin: 'https://profiler.firefox.com',
      hostname: 'profiler.firefox.com',
      favicon: 'https://profiler.firefox.com/favicon.ico',
    });
  });

  it('extracts the page data when there is only about:blank as relevant page', function () {
    const relevantPages = new Set([innerWindowIds.aboutBlank]);

    const pageData = extractProfileFilterPageData(pages, relevantPages);
    expect(pageData).toEqual({
      origin: 'about:blank',
      hostname: 'about:blank',
      favicon: null,
    });
  });

  it('fails to extract the page data when there is no profile data in common', function () {
    // Ignore the error we output when it fails.
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const relevantPages = new Set([innerWindowIds.unknown]);

    const pageData = extractProfileFilterPageData(pages, relevantPages);

    expect(pageData).toEqual(null);
    expect(console.error).toHaveBeenCalled();
  });

  it('fails to extract the page data when there is only a sub frame', function () {
    // Ignore the error we output when it fails.
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const relevantPages = new Set([innerWindowIds.exampleSubFrame]);

    const pageData = extractProfileFilterPageData(pages, relevantPages);

    expect(pageData).toEqual(null);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('findAddressProofForFile', function () {
  it('finds a correct address for a file', function () {
    const { profile } = getProfileFromTextSamples(`
      wr_renderer_render[lib:XUL][file:/Users/mstange/code/mozilla/gfx/webrender_bindings/src/bindings.rs][line:622][address:49d67a7]
      webrender::renderer::Renderer::render[lib:XUL][file:/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/mod.rs][line:1724][address:4bcff7b]
      webrender::renderer::Renderer::render_impl[lib:XUL][file:/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/mod.rs][line:2002][address:4bd0c57]
      webrender::renderer::Renderer::draw_frame[lib:XUL][file:/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/mod.rs][line:4701][address:4bd8d8b]
      webrender::renderer::Renderer::draw_picture_cache_target[lib:XUL][file:/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/mod.rs][line:2808][address:4bd8d8b][inl:1]
      webrender::renderer::Renderer::draw_alpha_batch_container[lib:XUL][file:/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/mod.rs][line:2980][address:4bd4d43]
      webrender::renderer::Renderer::draw_picture_cache_target[lib:XUL][file:/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/mod.rs][line:2808][address:4bd8d8b][inl:1]
      webrender::renderer::Renderer::draw_alpha_batch_container[lib:XUL][file:/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/mod.rs][line:2980][address:4bd4d43]
      webrender::renderer::shade::LazilyCompiledShader::bind[lib:XUL][file:/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/shade.rs][line:150][address:4a9f89b]
    `);

    const addressProof1 = findAddressProofForFile(
      profile,
      '/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/mod.rs'
    );
    expect(addressProof1).toEqual({
      debugName: 'XUL',
      breakpadId: 'SOMETHING_FAKE',
      address: 0x4bcff7b,
    });

    const addressProof2 = findAddressProofForFile(
      profile,
      '/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/shade.rs'
    );
    expect(addressProof2).toEqual({
      debugName: 'XUL',
      breakpadId: 'SOMETHING_FAKE',
      address: 0x4a9f89b,
    });

    const missingAddressProof = findAddressProofForFile(
      profile,
      '/Users/mstange/code/mozilla/xpcom/threads/nsThreadUtils.cpp'
    );
    expect(missingAddressProof).toBeNull();
  });
});

describe('calculateFunctionSizeLowerBound', function () {
  it('calculates the correct minimum size', function () {
    const { profile, nativeSymbolsDictPerThread } = getProfileFromTextSamples(`
      some_function[lib:XUL][file:hello.cpp][line:622][address:1005][sym:symSomeFunc:1000:]
      some_function[lib:XUL][file:hello.cpp][line:622][address:1002][sym:symSomeFunc:1000:]
      some_function[lib:XUL][file:hello.cpp][line:622][address:1007][sym:symSomeFunc:1000:]
    `);

    const thread = profile.threads[0];
    const nativeSymbolsDict = nativeSymbolsDictPerThread[0];
    const nativeSymbolIndex = nativeSymbolsDict.symSomeFunc;

    const functionSizeLowerBound = calculateFunctionSizeLowerBound(
      thread.frameTable,
      0x1000,
      nativeSymbolIndex
    );
    expect(functionSizeLowerBound).toEqual(8); // 0x1007 - 0x1000 + 1
  });
});

describe('getNativeSymbolsForCallNode', function () {
  it('finds a single symbol', function () {
    const { profile, funcNamesDictPerThread, nativeSymbolsDictPerThread } =
      getProfileFromTextSamples(`
        funA[lib:XUL][address:1005][sym:symA:1000:]
        funB[lib:XUL][address:2007][sym:symB:2000:]
        funC[lib:XUL][address:2007][sym:symB:2000:][inl:1]
      `);

    const thread = profile.threads[0];
    const { funA, funB, funC } = funcNamesDictPerThread[0];
    const { symB } = nativeSymbolsDictPerThread[0];
    const categories = ensureExists(
      profile.meta.categories,
      'Expected to find categories'
    );
    const defaultCategory = categories.findIndex((c) => c.name === 'Other');
    const callNodeInfo = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable,
      defaultCategory
    );
    const ab = getCallNodeIndexFromPath(
      [funA, funB],
      callNodeInfo.callNodeTable
    );
    expect(ab).not.toBeNull();
    const abc = getCallNodeIndexFromPath(
      [funA, funB, funC],
      callNodeInfo.callNodeTable
    );
    expect(abc).not.toBeNull();

    // Both the call path [funA, funB] and the call path [funA, funB, funC] end
    // up at a call node with native symbol symB.
    expect(
      getNativeSymbolsForCallNode(
        ensureExists(ab),
        callNodeInfo,
        thread.stackTable,
        thread.frameTable
      )
    ).toEqual([symB]);
    expect(
      getNativeSymbolsForCallNode(
        ensureExists(abc),
        callNodeInfo,
        thread.stackTable,
        thread.frameTable
      )
    ).toEqual([symB]);
  });

  it('finds multiple symbols', function () {
    const { profile, funcNamesDictPerThread, nativeSymbolsDictPerThread } =
      getProfileFromTextSamples(`
        funA[lib:XUL][address:1005][sym:symA:1000:]         funA[lib:XUL][address:1005][sym:symA:1000:]
        funB[lib:XUL][address:2007][sym:symB:2000:]         funD[lib:XUL][address:4007][sym:symD:4000:]
        funC[lib:XUL][address:2007][sym:symB:2000:][inl:1]  funC[lib:XUL][address:4007][sym:symD:4000:][inl:1]
      `);

    const thread = profile.threads[0];
    const { funC } = funcNamesDictPerThread[0];
    const { symB, symD } = nativeSymbolsDictPerThread[0];
    const categories = ensureExists(
      profile.meta.categories,
      'Expected to find categories'
    );
    const defaultCategory = categories.findIndex((c) => c.name === 'Other');
    const invertedThread = invertCallstack(thread, defaultCategory);
    const callNodeInfo = getCallNodeInfo(
      invertedThread.stackTable,
      invertedThread.frameTable,
      invertedThread.funcTable,
      defaultCategory
    );
    const c = getCallNodeIndexFromPath([funC], callNodeInfo.callNodeTable);
    expect(c).not.toBeNull();

    // The call node for funC in the inverted thread has one sample where funC
    // is called by funB and one sample where it's called by funD. The call to
    // funC was inlined into each of those functions. So the call node has two
    // native symbols, B and D.
    expect(
      new Set(
        getNativeSymbolsForCallNode(
          ensureExists(c),
          callNodeInfo,
          invertedThread.stackTable,
          invertedThread.frameTable
        )
      )
    ).toEqual(new Set([symB, symD]));
  });
});

describe('getNativeSymbolInfo', function () {
  it('calculates the correct native symbol info', function () {
    const { profile, nativeSymbolsDictPerThread } = getProfileFromTextSamples(`
      some_function[lib:XUL][file:hello.cpp][line:622][address:1005][sym:symSomeFunc:1000:]
      some_function[lib:XUL][file:hello.cpp][line:622][address:1002][sym:symSomeFunc:1000:]
      some_function[lib:XUL][file:hello.cpp][line:622][address:1007][sym:symSomeFunc:1000:]
      other_function[lib:XUL][file:hello.cpp][line:622][address:2007][sym:symOtherFunc:2000:1e]
    `);

    const thread = profile.threads[0];
    const { symSomeFunc, symOtherFunc } = nativeSymbolsDictPerThread[0];

    expect(
      getNativeSymbolInfo(
        symSomeFunc,
        thread.nativeSymbols,
        thread.frameTable,
        thread.stringTable
      )
    ).toEqual({
      name: 'symSomeFunc',
      address: 0x1000,
      functionSize: 8,
      functionSizeIsKnown: false,
      libIndex: profile.libs.findIndex((l) => l.name === 'XUL'),
    });
    expect(
      getNativeSymbolInfo(
        symOtherFunc,
        thread.nativeSymbols,
        thread.frameTable,
        thread.stringTable
      )
    ).toEqual({
      name: 'symOtherFunc',
      address: 0x2000,
      functionSize: 0x1e,
      functionSizeIsKnown: true,
      libIndex: profile.libs.findIndex((l) => l.name === 'XUL'),
    });
  });
});
