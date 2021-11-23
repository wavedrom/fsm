'use strict';

const normDesc = desc => {
  let states = desc.states || [];
  if (!Array.isArray(states) && typeof states === 'object') {
    states = Object.keys(states).map(name => ({name, next: states[name]}));
  }

  states.map(row => {
    let next = row.next || [];
    if (!Array.isArray(next) && typeof next === 'object') {
      next = Object.keys(next).map(name => ({name, cond: next[name]}));
    }
    row.next = next;
  });

  desc.states = states;
  desc.cond = desc.cond || '1\'b1';
  desc.clock = desc.clock || 'clock';
  desc.reset = desc.reset || 'reset';
  desc.width = desc.width || Math.ceil(Math.log2(states.length));
  desc.name = desc.name || 'FSM';
};

const regDef = desc => [
  'reg [' + (desc.width - 1) + ':0] ' +
  desc.name + '_state, ' + desc.name + '_next;',
  ''
];

const stateEnums = desc => [
  '// ' + desc.name + ' state enums',
  ...(desc.states).map((state, idx) =>
    'wire [' + (desc.width - 1) + ':0] ' + desc.name + '_' + state.name + ' = ' + idx + ';'
  ),
  ''
];

const stateConds = desc => [
  '// ' + desc.name + ' transition conditions',
  ...(desc.states).flatMap(state =>
    state.next.map(next =>
      'wire ' + [desc.name, state.name, next.name].join('_') +
      ' = ' +
      '(' +
        '(' + desc.name + '_state == ' + desc.name + '_' + state.name + ')' +
        ' & ' +
        '(' + next.cond + ' == ' + desc.cond + ')' +
      ');'
    )
  ),
  ''
];

const selectNext = desc => [
  '// ' + desc.name + ' next state select',
  'always @(*) begin : ' + desc.name + '_next_select',
  '  case (1\'b1)',
  ...(desc.states).flatMap(state =>
    state.next.map(next =>
      '    ' + [desc.name, state.name, next.name].join('_') + ': ' +
      desc.name + '_next = ' + desc.name + '_' + next.name + ';'
    )
  ),
  '  endcase',
  'end',
  ''
];

const flipFlopState = desc => [
  'always_ff @(posedge ' + desc.clock + ' or negedge reset_n)',
  '  if (~reset_n)',
  '    ' + desc.name + '_state <= ' + desc.name + '_' + desc.states[0].name + ';',
  '  else',
  '    ' + desc.name + '_state <= ' + desc.name + '_next;',
  ''
];

const alwaysAscii = desc => {
  if (!desc.ascii) {
    return [];
  }
  const maxLen = desc.states.reduce((res, state) => Math.max(res, state.name.length), 1);
  return [
    'reg [' + (maxLen * 8 - 1) + ':0] ' + desc.name + '_state_ascii;',
    'always @(*)',
    '  case ({' + desc.name + '_state})',
    ...(desc.states).map(state =>
      '    ' + desc.name + '_' + state.name + ': ' + desc.name + '_state_ascii = "' + state.name.padEnd(maxLen) + '";'
    ),
    '    default: ' + desc.name + '_state_ascii = "' + '%Error'.slice(0, maxLen).padEnd(maxLen) + '";',
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
    ...regDef(desc),
    ...stateEnums(desc),
    ...stateConds(desc),
    ...selectNext(desc),
    ...flipFlopState(desc),
    ...alwaysAscii(desc)
  ].join('\n');
};

module.exports = emitVerilog;
