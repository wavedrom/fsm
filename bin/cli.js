#!/usr/bin/env node
'use strict';

const process = require('process');
const path = require('path');
const { readFile, writeFile, watch } = require('fs/promises');
const { setTimeout } = require('timers/promises');
const lib = require('../lib/');

const getArguments = async () => {
  const res = [];
  if (process.argv.length < 3) {
    throw new Error('tool expects >= 1 arguments, got: ' + (process.argv.length - 2));
  }
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    const pat = path.resolve(process.cwd(), arg);
    res.push(pat);
  }
  return res;
};


const parse = (src) => {
  const cells = [];
  let str = src;
  while (true) {
    const idx0 = str.search(/\/\*/);
    if (idx0 === -1) {
      cells.push({kind: 'body', src: str});
      break;
    }
    if (idx0 > 0) {
      const chunk = str.slice(0, idx0);
      cells.push({kind: 'body', src: chunk});
    }
    str = str.slice(idx0 + 2);
    const idx1 = str.search(/\*\//);
    if (idx1 === -1) {
      (cells[cells.length - 1]).body += '/*' + str;
      break;
    }
    if (idx1 > 0) {
      const chunk = str.slice(0, idx1);
      cells.push({kind: 'meta', src: chunk});
    }
    str = str.slice(idx1 + 2);
  }
  return cells;
};

const update = (cells) => {
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (cell.kind === 'meta') {
      let res;
      const fin = undefined;
      const fsm = lib.emit.verilog;
      try {
        res = new Function(`
'use strict';
return (function (lib) {
  const {fsm, fin} = lib;
  return (${cell.src});
})`)()({fsm, fin});
      } catch (err) {
        res = '// ' + err.message;
        console.log(err);
      }
      if (res !== undefined) {
        const cell1 = cells[i + 1];
        const cell2 = cells[i + 2];
        if (cell2 && cell2.kind === 'meta' && cell2.src.trim() === 'fin') {
          cells[i + 1] = {kind: 'body', src: '\n' + res + '\n'};
        } else {
          cells.splice(i + 1, 0, {kind: 'body', src: '\n' + res + '\n/* fin */'});
        }
      }
    }
  }
};

const main = async () => {
  const args = await getArguments();

  for (const filename of args) {
    for (let i = 0; i < 100000; i++) {
      const ac = new AbortController();
      const { signal } = ac;
      const watcher = watch(filename, { signal });
      await watcher.next();
      ac.abort();
      const src = await readFile(filename, {encoding: 'utf8'});
      const cells = parse(src);
      update(cells);
      const dst = cells.map(cell =>
        (cell.kind === 'meta')
          ? '/*' + cell.src + '*/'
          : cell.src
      ).join('');
      // console.log(cells);
      await setTimeout(300);
      await writeFile(filename, dst);
      // console.log(i);
    }
  }
};

main();
