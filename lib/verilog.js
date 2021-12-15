'use strict';

const maxName = (res, state) => Math.max(res, state.name.length);

const normDesc = desc => {
  let states = desc.states || [];
  if (!Array.isArray(states) && typeof states === 'object') {
    states = Object.keys(states).map(name => ({name, next: states[name]}));
  }
  desc.states = states;

  let wires = desc.wires || [];
  if (!Array.isArray(wires) && typeof wires === 'object') {
    wires = Object.keys(wires).map(name => {
      const val = wires[name];
      const res = {name};
      if (typeof val === 'object') {
        Object.assign(res, val);
      } else {
        res.init = val;
      }
      return res;
    });
  }
  desc.wires = wires;

  let localparams = desc.localparams || [];
  if (!Array.isArray(localparams) && typeof localparams === 'object') {
    localparams = Object.keys(localparams).map(name => ({name, expr: localparams[name]}));
  }
  desc.localparams = localparams;

  states.map(row => {
    let next = row.next || [];
    if (!Array.isArray(next) && typeof next === 'object') {
      next = Object.keys(next).map(name => ({name, cond: next[name]}));
    }
    row.next = next;
  });


  // desc.cond = desc.cond || '1\'b1';
  desc.clock = desc.clock || 'clock';
  desc.reset = desc.reset || 'reset';
  desc.width = desc.width || Math.ceil(Math.log2(states.length));
  desc.name = desc.name || 'FSM';
  desc.initialState = desc.initialState || desc.states[0].name;
};

const regDefs = desc => [
  'reg [' + (desc.width - 1) + ':0] ' +
  desc.name + '_state, ' + desc.name + '_next;',
  ''
];

const localparamDefs = desc => [
  ...(desc.localparams).map((e =>
    'localparam ' + e.name + ' = ' + e.expr + ';'
  )),
  ''
];

const wireDefs = desc => [
  ...(desc.wires).map((e => {
    const dim = e.width ? ('[' + (e.width - 1) + ':0] ') : '';
    return 'wire ' + dim + e.name + ' = ' + e.init + ';';
  })),
  ''
];

const stateEnums = desc => {
  const maxW = desc.states.reduce(maxName, 2);
  return [
    '// ' + desc.name + ' state enums',
    ...(desc.states).map((state, idx) =>
      'wire [' + (desc.width - 1) + ':0] ' + desc.name + '_' + state.name.padEnd(maxW) + ' = ' + idx + ';'
    ),
    ''
  ];
};

const stateConds = desc => {
  const maxSN = desc.states.reduce((res, state) =>
    Math.max(res, state.name.length + state.next.reduce(maxName, 2)), 2);

  const maxS = desc.states.reduce(maxName, 2);

  return [
    '// ' + desc.name + ' transition conditions',
    ...(desc.states).flatMap(state =>
      state.next.map(next =>
        'wire ' + desc.name + '_' + (state.name + '_' + next.name).padEnd(maxSN + 1) +
        ' = ' +
        '(' +
          '(' + desc.name + '_state == ' + desc.name + '_' + state.name.padEnd(maxS) + ')' +
          ' & ' +
          '(' +
          (desc.cond
            ? (next.cond + ' == ' + desc.cond)
            : next.cond
          ) +
          ')' +
        ');'
      )
    ),
    ''
  ];
};

const enterConditions = desc => {
  const maxS = desc.states.reduce(maxName, 2);
  const res = ['// ' + desc.name + ' state enter conditions'];
  const o = {};
  desc.states.map(state => {
    state.next.map(next => {
      o[next.name] = o[next.name] || {};
      o[next.name][state.name] = true;
    });
  });
  res.push(...Object.keys(o).map(to =>
    'wire ' + desc.name + '_' + (to + '_onEnter').padEnd(maxS + 8) + ' = (' +
    Object.keys(o[to]).map(from => [desc.name, from, to].join('_')).join(' & ') +
    ');'
  ));
  return res;
};

const exitConditions = desc => {
  const maxS = desc.states.reduce(maxName, 2);
  const res = [
    '// ' + desc.name + ' state exit conditions',
    ...(desc.states).map(state => {
      if (state.next.length === 0) {
        return '// ' + desc.name + '_' + state.name + ' state has no exit';
      }
      return 'wire ' + desc.name + '_' + (state.name + '_onExit').padEnd(maxS + 8) + 
        ' = (' +
        state.next.map(next => [desc.name, state.name, next.name].join('_')).join(' & ') +
        ');';
    }),
    ''
  ];
  return res;
};

const selectNext = desc => {
  const maxSN = desc.states.reduce((res, state) =>
    Math.max(res, state.name.length + state.next.reduce(maxName, 2)), 2);

  return [
    '// ' + desc.name + ' next state select',
    'always @(*) begin : ' + desc.name + '_next_select',
    '  case (1\'b1)',
    ...(desc.states).flatMap(state =>
      state.next.map(next =>
        '    ' + desc.name + '_' + (state.name + '_' + next.name).padEnd(maxSN + 2) + ': ' +
        desc.name + '_next = ' + desc.name + '_' + next.name + ';'
      )
    ),
    '    default'.padEnd(maxSN + desc.name.length + 7) + ': ' + desc.name + '_next = ' + desc.name + '_state;',
    '  endcase',
    'end',
    ''
  ];
};

const asyncResetEdge = desc => {
  if (desc.asyncReset) {
    if (desc.asyncReset[0] === '~') {
      return ' or negedge ' + desc.asyncReset.slice(1);
    } else {
      return ' or posedge ' + desc.asyncReset;
    }
  }
  return '';
};

const flipFlopState = desc => {
  const restCond = desc.asyncReset || desc.syncReset || 'rst';
  const LHSOP = desc.name + '_state <= ';
  return [
    'always @(posedge ' + desc.clock + asyncResetEdge(desc) + ')',
    '  if (' + restCond + ') ' +
    LHSOP + desc.name + '_' + desc.initialState + ';',
    '  else  ' + ' '.repeat(restCond.length) +
    LHSOP + desc.name + '_next;',
    ''
  ];
};

const alwaysAscii = desc => {
  if (!desc.ascii) {
    return [];
  }
  const maxS = desc.states.reduce(maxName, 2);
  const maxLen = desc.states.reduce((res, state) => Math.max(res, state.name.length), 1);
  return [
    'reg [' + (maxLen * 8 - 1) + ':0] ' + desc.name + '_state_ascii;',
    'always @(*)',
    '  case ({' + desc.name + '_state})',
    ...(desc.states).map(state =>
      '    ' + desc.name + '_' + state.name.padEnd(maxS) + ' : ' + desc.name + '_state_ascii = "' + state.name.padEnd(maxLen) + '";'
    ),
    '    default'.padEnd(maxS + 8) + ' : ' + desc.name + '_state_ascii = "' + '%Error'.slice(0, maxLen).padEnd(maxLen) + '";',
    '  endcase',
    ''
  ];
};

const emitVerilog = (desc) => {
  desc = desc || {};
  normDesc(desc);
  if (desc.states.length === 0) {
    return '// empty';
  }
  return [
    '// ***** THIS TEXT IS AUTOMATICALY GENERATED, DO NOT EDIT *****',
    ...regDefs(desc),
    ...localparamDefs(desc),
    ...wireDefs(desc),
    ...stateEnums(desc),
    ...stateConds(desc),
    ...enterConditions(desc),
    ...exitConditions(desc),
    ...selectNext(desc),
    ...flipFlopState(desc),
    ...alwaysAscii(desc),
    '// ***** END OF AUTOMATICALY GENERATED TEXT, DO NOT EDIT *****'
  ].join('\n');
};

module.exports = emitVerilog;
