/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import type {
  Profile,
  Pid,
  Bytes,
  IndexIntoFuncTable,
} from 'firefox-profiler/types';

import {
  getEmptyProfile,
  getEmptyThread,
  getEmptyUnbalancedNativeAllocationsTable,
} from 'firefox-profiler/profile-logic/data-structures';
import { UniqueStringArray } from 'firefox-profiler/utils/unique-string-array';

import { coerce, ensureExists } from 'firefox-profiler/utils/flow';

/**
 * DHAT is a heap memory analysis tool in valgrind. It's also available as rust component.
 * https://github.com/nnethercote/dhat-rs
 *
 * The format is defined in:
 *
 * git clone git://sourceware.org/git/valgrind.git
 * dhat/dh_main.c
 */
type DhatJson = $ReadOnly<{|
  // Version number of the format. Incremented on each
  // backwards-incompatible change. A mandatory integer.
  dhatFileVersion: 2,

  // The invocation mode. A mandatory, free-form string.
  mode: 'heap',

  // The verb used before above stack frames, i.e. "<verb> at {". A
  // mandatory string.
  verb: 'Allocated',

  // Are block lifetimes recorded? Affects whether some other fields are
  // present. A mandatory boolean.
  bklt: boolean,

  // Are block accesses recorded? Affects whether some other fields are
  // present. A mandatory boolean.
  bkacc: boolean,

  // Byte/bytes/blocks-position units. Optional strings. "byte", "bytes",
  // and "blocks" are the values used if these fields are omitted.
  bu: 'byte',
  bsu: 'bytes',
  bksu: 'blocks',

  // Time units (individual and 1,000,000x). Mandatory strings.
  tu: 'instrs',
  Mtu: 'Minstr',

  // The "short-lived" time threshold, measures in "tu"s.
  // - bklt=true: a mandatory integer.
  // - bklt=false: omitted.
  tuth: 500,

  // The executed command. A mandatory string.
  cmd: string,

  // The process ID. A mandatory integer.
  pid: Pid,

  // The time at the end of execution (t-end). A mandatory integer.
  te: InstructionCounts,

  // The time of the global max (t-gmax).
  // - bklt=true: a mandatory integer.
  // - bklt=false: omitted.
  tg: InstructionCounts,

  // The program points. A mandatory array.
  pps: ProgramPoint[],

  // Frame table. A mandatory array of strings.
  // e.g.
  //  [
  //   '[root]',
  //   '0x4AA1D9F: _nl_normalize_codeset (l10nflist.c:332)',
  //   '0x4A9B414: _nl_load_locale_from_archive (loadarchive.c:173)',
  //   '0x4A9A2BE: _nl_find_locale (findlocale.c:153)'
  // ],
  ftbl: string[],
|}>;

type ProgramPoint = $ReadOnly<{|
  // Total bytes and blocks. Mandatory integers.
  tb: Bytes,
  tbk: Blocks,

  // Total lifetimes of all blocks allocated at this PP.
  // - bklt=true: a mandatory integer.
  // - bklt=false: omitted.
  tl: InstructionCounts,

  // The maximum bytes and blocks for this PP.
  // - bklt=true: mandatory integers.
  // - bklt=false: omitted.
  mb: Bytes,
  mbk: Blocks,

  // The bytes and blocks at t-gmax for this PP.
  // - bklt=true: mandatory integers.
  // - bklt=false: omitted.
  gb: Bytes,
  gbk: Blocks,

  // The bytes and blocks at t-end for this PP.
  // - bklt=true: mandatory integers.
  // - bklt=false: omitted.
  eb: Bytes,
  ebk: Blocks,

  // The reads and writes of blocks for this PP.
  // - bkacc=true: mandatory integers.
  // - bkacc=false: omitted.
  rb: ReadCount,
  wb: WriteCount,

  // The exact accesses of blocks for this PP. Only used when all
  // allocations are the same size and sufficiently small. A negative
  // element indicates run-length encoding of the following integer.
  // E.g. `-3, 4` means "three 4s in a row".
  // - bkacc=true: an optional array of integers.
  // - bkacc=false: omitted.
  //
  // e.g. [5, -3, 4, 2]
  acc: number[],

  // Frames. Each element is an index into the "ftbl" array above.
  // The array is ordered from leaf to root.
  // - All modes: A mandatory array of integers.
  fs: IndexIntoDhatFrames[],
|}>;

// All units of time are in instruction counts.
// Per: https://valgrind.org/docs/manual/dh-manual.html
//   As with the Massif heap profiler, DHAT measures program progress by counting
//   instructions, and so presents all age/time related figures as instruction counts.
//   This sounds a little odd at first, but it makes runs repeatable in a way which
//   is not possible if CPU time is used.
type InstructionCounts = number;
type Blocks = number;
type IndexIntoDhatFrames = number;
type ReadCount = number;
type WriteCount = number;

/**
 * The dhat convertor converts to the processed profile format, rather than to the Gecko
 * format, as it needs the UnbalancedNativeAllocationsTable type, which is unavailable
 * in the Gecko format. In the Gecko format, that data comes in the form of markers, which
 * would be awkard to target.
 */
export function attemptToConvertDhat(json: mixed): Profile | null {
  if (!json || typeof json !== 'object') {
    return null;
  }

  const { dhatFileVersion } = json;
  if (typeof dhatFileVersion !== 'number') {
    // This is not a dhat file.
    return null;
  }

  if (dhatFileVersion !== 2) {
    throw new Error(
      `This importer only supports dhat version 2. The file provided was version ${dhatFileVersion}.`
    );
  }
  const dhat = coerce<mixed, DhatJson>(json);

  const profile = getEmptyProfile();
  profile.meta.product = dhat.cmd + ' (dhat)';
  profile.meta.importedFrom = `dhat`;

  const allocationsTable = getEmptyUnbalancedNativeAllocationsTable();
  const { funcTable, stringTable, stackTable, frameTable } = getEmptyThread();

  const funcKeyToFuncIndex = new Map<string, IndexIntoFuncTable>();

  // dhat profiles do no support categories. Fill the category and subcategory information
  // with 0s.
  const otherCategory = 0;
  const otherSubCategory = 0;

  // Convert the frame table.
  for (let funcName of dhat.ftbl) {
    let fileName = dhat.cmd;
    let address = -1;
    let line = null;
    let column = null;

    const result = funcName.match(
      /^0x([0-9a-f]+): (.+) \((.+):(\d+):(\d+)\)$/i
    );
    // ^0x([0-9a-f]+): (.+) \((.+):(\d+):(\d+)\)$   Regex
    //    (1        )  (2 )   (3 ) (4  ) (5  )      Capture groups
    // ^                                        $   Start to end
    //               :      \(                \)    Some raw characters
    //    ([0-9a-f]+)                               Match the address, e.g. 10250148c
    //                 (.+)                         Match the function name
    //                        (.+)                  Match the filename
    //                             (\d+)            Match the line number
    //                                   (\d+)      Match the column number

    // Example input: "0x10250148c: alloc::vec::Vec<T,A>::append_elements (vec.rs:1469:9)"
    // Capture groups:   111111111  2222222222222222222222222222222222222  333333 4444 5
    if (result) {
      address = parseInt(result[1], 16);
      funcName = result[2];
      fileName = result[3];
      line = Number(result[4]);
      column = Number(result[5]);
    }
    // If the above regex doesn't match, just use the raw funcName, without additional
    // information.

    const funcKey = `${funcName} ${fileName}`;

    let funcIndex = funcKeyToFuncIndex.get(funcKey);
    if (funcIndex === undefined) {
      funcTable.name.push(stringTable.indexForString(funcName));
      funcTable.isJS.push(false);
      funcTable.relevantForJS.push(false);
      funcTable.resource.push(-1);
      funcTable.fileName.push(stringTable.indexForString(fileName));
      funcTable.lineNumber.push(line);
      funcTable.columnNumber.push(column);
      funcIndex = funcTable.length++;
      funcKeyToFuncIndex.set(funcKey, funcIndex);
    }

    frameTable.address.push(address);
    frameTable.line.push(line);
    frameTable.column.push(column);
    frameTable.category.push(otherCategory);
    frameTable.subcategory.push(otherSubCategory);
    frameTable.innerWindowID.push(null);
    frameTable.implementation.push(null);
    frameTable.func.push(funcIndex);
    frameTable.length++;
  }

  const totalBytes: Bytes[] = [];
  const maximumBytes: Bytes[] = [];
  const bytesAtGmax: Bytes[] = [];
  const endBytes: Bytes[] = [];

  for (const pp of dhat.pps) {
    // Never reset the stackIndex, stack indexes always growing larger.
    let stackIndex = -1;
    let prefix = null;

    // Go from root to tip on the backtrace.
    for (let i = pp.fs.length - 1; i >= 0; i--) {
      // The dhat frame indexes matches the process profile frame index.
      const frameIndex = pp.fs[i];
      const funcIndex = ensureExists(
        frameTable.func[frameIndex],
        'Expected to find a funcIndex from a frameIndex'
      );

      // Case 1: The stack index starts at -1, increment by 1 to start searching stacks
      //         at index 0.
      // Case 2: This is the previously matched stack index, increment it by 1 to continue
      //         searching at the next stack index.
      stackIndex++;

      // Start searching for a stack index.
      for (; stackIndex < stackTable.length; stackIndex++) {
        const nextFrameIndex = stackTable.frame[stackIndex];
        if (
          frameTable.func[nextFrameIndex] === funcIndex &&
          stackTable.prefix[stackIndex] === prefix
        ) {
          break;
        }
      }

      if (stackIndex === stackTable.length) {
        // No stack index was found, add on a new one.
        stackTable.frame.push(frameIndex);
        stackTable.category.push(otherCategory);
        stackTable.category.push(otherSubCategory);
        stackTable.prefix.push(prefix);
        // The stack index already points to this spot.
        stackTable.length++;
      }

      prefix = stackIndex;
    }

    // Skip pushing onto the allocation weights, as each byte type will be added
    // as a separate thread.
    totalBytes.push(pp.tb);
    maximumBytes.push(pp.mb);
    bytesAtGmax.push(pp.gb);
    endBytes.push(pp.eb);

    allocationsTable.time.push(0);
    allocationsTable.stack.push(stackIndex);
    allocationsTable.length++;
  }

  profile.threads = [
    { name: 'Total Bytes', weight: totalBytes },
    { name: 'Maximum Bytes', weight: maximumBytes },
    { name: 'Bytes at Global Max', weight: bytesAtGmax },
    { name: 'Bytes at End', weight: endBytes },
  ].map(({ name, weight }, i) => {
    const thread = getEmptyThread();

    // This profile contains 4 threads with the same pid, and different tids.
    // We rely on tids to be unique in some parts of the profiler code.
    thread.pid = dhat.pid;
    thread.tid = i;
    thread.name = name;
    thread.stringTable = new UniqueStringArray(stringTable.serializeToArray());

    thread.funcTable.name = funcTable.name.slice();
    thread.funcTable.isJS = funcTable.isJS.slice();
    thread.funcTable.relevantForJS = funcTable.relevantForJS.slice();
    thread.funcTable.resource = funcTable.resource.slice();
    thread.funcTable.fileName = funcTable.fileName.slice();
    thread.funcTable.lineNumber = funcTable.lineNumber.slice();
    thread.funcTable.columnNumber = funcTable.columnNumber.slice();
    thread.funcTable.length = funcTable.length;

    thread.frameTable.address = frameTable.address.slice();
    thread.frameTable.line = frameTable.line.slice();
    thread.frameTable.column = frameTable.column.slice();
    thread.frameTable.category = frameTable.category.slice();
    thread.frameTable.subcategory = frameTable.subcategory.slice();
    thread.frameTable.innerWindowID = frameTable.innerWindowID.slice();
    thread.frameTable.implementation = frameTable.implementation.slice();
    thread.frameTable.func = frameTable.func.slice();
    thread.frameTable.length = frameTable.length;

    thread.stackTable.frame = stackTable.frame.slice();
    thread.stackTable.category = stackTable.category.slice();
    thread.stackTable.category = stackTable.category.slice();
    thread.stackTable.prefix = stackTable.prefix.slice();
    thread.stackTable.length = stackTable.length;

    thread.nativeAllocations = {
      time: allocationsTable.time.slice(),
      stack: allocationsTable.stack.slice(),
      weight,
      weightType: 'bytes',
      length: allocationsTable.length,
    };

    return thread;
  });

  return profile;
}
