'use strict';

const emitDot = desc => {
  let states = desc.states;
  if (!Array.isArray(states) && typeof states === 'object') {
    states = Object.keys(states).map(name => ({name, next: states[name]}));
  }

  // const pos = {x: 0, y: 0};

  const nodes = states.map(row => {
    let name;
    if (typeof row === 'string') {
      name = row;
    } else
    if (typeof row === 'object') {
      name = row.name;
    }
    return name + ' [shape=rect]';
  });
  
  const edges = states.flatMap(row => {
    let next = row.next;
    if (next === undefined) {
      return [];  
    }
    if (!Array.isArray(next) && typeof next === 'object') {
      next = Object.keys(next).map(name => ({name, cond: next[name]}));
    }
    return next.flatMap(col => {
      return row.name + ' -> ' + col.name + ' [label="' + col.cond + '"]' ;
    });
  });
  
  return `\
digraph g {
${nodes.join('\n')}
${edges.join('\n')}
}`;
};

module.exports = emitDot;
