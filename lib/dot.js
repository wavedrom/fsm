'use strict';

const knownStateAttributes = ['name', 'next'];

const emitDot = desc => {
  if (typeof desc !== 'object') {
    return;
  }
  let states = desc.states || [];
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
    return name + ' [ ' +
      Object
        .keys(row)
        .filter(key => !knownStateAttributes.includes(key))
        .map(key => key + '="' + row[key] + '"')
        .join('; ') +
      ' ]';
  });

  // (row.color ? ' color="' + row.color + '"; ': '') +
  // (row.fillcolor ? ' style=filled; fillcolor="' + row.fillcolor + '"; ' : '') +
  // 'shape=' + (row.shape || 'rect') +

  const edges = states.flatMap(row => {
    let next = row.next || [];
    if (next === undefined) {
      return [];
    }
    if (!Array.isArray(next) && typeof next === 'object') {
      next = Object.keys(next).map(name => ({name, condition: next[name]}));
    }
    return next.flatMap(col => {
      return row.name + ' -> ' + col.name + ' [label="' + col.condition + '"]' ;
    });
  });

  return `\
digraph g {
node [ style=rounded; shape=rect ]
${nodes.join('\n')}
${edges.join('\n')}
}`;
};

module.exports = emitDot;
