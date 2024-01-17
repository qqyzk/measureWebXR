/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type {
  FuncTable,
  SamplesTable,
  FrameTable,
  Profile,
} from 'firefox-profiler/types';
import { ensureExists } from 'firefox-profiler/utils/flow';

import {
  getEmptyThread,
  getEmptyProfile,
  getEmptyStackTable,
} from '../../../profile-logic/data-structures';

/**
 * Create a profile with three identical threads, with the frame tree and call
 * tree shown below.
 *
 * Note that this fixture doesn't use the `getProfileFromTextSamples()` function to
 * generate the profile, as it's testing the relationships between frames, and thus
 * cannot be generated from a list of functions.
 *
 *            stack0 (funcA)                               callNode0 (funcA)
 *                 |                                            |
 *                 v                                            v
 *            stack1 (funcB)            merged             callNode1 (funcB)
 *                 |                  stackTable                |
 *                 v                      ->                    v
 *            stack2 (funcC)                               callNode2 (funcC)
 *            /            \                                    |
 *           V              V                                   v
 *    stack3 (funcD)     stack5 (funcD)                    callNode3 (funcD)
 *         |                  |                          /               \
 *         v                  V                         V                 V
 *    stack4 (funcE)     stack6 (funcF)         callNode4 (funcE)       callNode5 (funcF)
 */
export default function getProfile(): Profile {
  const profile = getEmptyProfile();
  let thread = getEmptyThread();
  const funcNames = ['funcA', 'funcB', 'funcC', 'funcD', 'funcE', 'funcF'].map(
    (name) => thread.stringTable.indexForString(name)
  );

  const categoryOther = ensureExists(
    profile.meta.categories,
    'Expected to find categories'
  ).findIndex((c) => c.name === 'Other');

  // Be explicit about table creation so flow errors are really readable.
  const funcTable: FuncTable = {
    name: funcNames,
    isJS: Array(funcNames.length).fill(false),
    resource: Array(funcNames.length).fill(-1),
    relevantForJS: Array(funcNames.length).fill(false),
    fileName: Array(funcNames.length).fill(''),
    lineNumber: Array(funcNames.length).fill(null),
    columnNumber: Array(funcNames.length).fill(null),
    length: funcNames.length,
  };

  const frameFuncs = [
    'funcA', // 0
    'funcB', // 1
    'funcC', // 2
    'funcD', // 3
    'funcD', // 4 duplicate
    'funcE', // 5
    'funcF', // 6
  ].map((name) => thread.stringTable.indexForString(name));
  // Name the indices
  const [
    funcAFrame,
    funcBFrame,
    funcCFrame,
    funcDFrame,
    funcDFrameDuplicate,
    funcEFrame,
    funcFFrame,
  ] = frameFuncs.map((_, i) => i);

  const frameTable: FrameTable = {
    func: frameFuncs.map((stringIndex) => funcTable.name.indexOf(stringIndex)),
    address: Array(frameFuncs.length).fill(-1),
    inlineDepth: Array(frameFuncs.length).fill(0),
    nativeSymbol: Array(frameFuncs.length).fill(null),
    category: Array(frameFuncs.length).fill(null),
    subcategory: Array(frameFuncs.length).fill(null),
    innerWindowID: Array(frameFuncs.length).fill(null),
    implementation: Array(frameFuncs.length).fill(null),
    line: Array(frameFuncs.length).fill(null),
    column: Array(frameFuncs.length).fill(null),
    length: frameFuncs.length,
  };

  const stackTable = getEmptyStackTable();

  // Provide a utility function for readability.
  function addToStackTable(frame, prefix, category) {
    stackTable.frame.push(frame);
    stackTable.prefix.push(prefix);
    stackTable.category.push(category);
    stackTable.subcategory.push(0);
    stackTable.length++;
  }
  // Shared root stacks.
  addToStackTable(funcAFrame, null, categoryOther);
  addToStackTable(funcBFrame, 0, categoryOther);
  addToStackTable(funcCFrame, 1, categoryOther);

  // Branch 1.
  addToStackTable(funcDFrame, 2, categoryOther);
  addToStackTable(funcEFrame, 3, categoryOther);

  // Branch 2.
  addToStackTable(funcDFrameDuplicate, 2, categoryOther);
  addToStackTable(funcFFrame, 5, categoryOther);

  // Have the first sample pointing to the first branch, and the second sample to
  // the second branch of the stack.
  const samples: SamplesTable = {
    responsiveness: [0, 0],
    stack: [4, 6],
    time: [0, 0],
    weightType: 'samples',
    weight: null,
    length: 2,
  };

  thread = Object.assign(thread, {
    samples,
    stackTable,
    funcTable,
    frameTable,
  });

  profile.threads.push(
    thread,
    Object.assign({}, thread),
    Object.assign({}, thread)
  );

  return profile;
}
