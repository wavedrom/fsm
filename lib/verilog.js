'use strict';

const pad = len => str => str.slice(0, len).padEnd(len);

const maxName = (res, state) => Math.max(res, name(state).length);

const merge = (story, state) => {
  Object.keys(state).map(key => {
    const val = state[key];
    if (Array.isArray(val)) {
      const valStory = story[key];
      story[key] = (valStory || []).concat(val);
    } else {
      story[key] = val;
    }
  });
};

function name () {
  if (arguments.length === 0) {
    return '';
  }
  const res = [];
  for (let i = 0; i < arguments.length; i++) {
    const arg = arguments[i];
    if (typeof arg !== 'object' || !(arg.name)) {
      res.push(arg.toString());
    } else {
      res.push(arg.name.toString());
    }
  }
  return res.join('_');
}

const mergeStates = states => {
  const res = [];
  const obj = {};
  for (const state of states) {
    const name = state.name;
    const story = obj[name];
    if (story === undefined) {
      obj[name] = state;
      res.push(state);
    } else {
      merge(story, state);
    }
  }
  return res;
};

const normDesc = desc => {
  let states = desc.states || [];
  if (!Array.isArray(states) && typeof states === 'object') {
    states = Object.keys(states).map(name => ({name, next: states[name]}));
  }

  states = states.map(row =>
    (typeof row === 'object')
      ? row
      : {name: row.toString(), next: []});

  states.map(row => {
    let next = row.next || [];
    if (!Array.isArray(next) && typeof next === 'object') {
      next = Object.keys(next).map(name => ({name, condition: next[name]}));
    }
    row.next = next;
  });

  states = mergeStates(states);
  desc.states = states;

  let wires = desc.wires || [];
  if (!Array.isArray(wires) && typeof wires === 'object') {
    wires = Object.keys(wires).map(name => {
      const val = wires[name];
      const res = {name};
      if (typeof val === 'object') {
        Object.assign(res, val);
      } else {
        res.width = val;
      }
      return res;
    });
  }
  desc.wires = wires;

  let registers = desc.registers || [];
  if (!Array.isArray(registers) && typeof registers === 'object') {
    registers = Object.keys(registers).map(name => {
      const val = registers[name];
      const res = {name};
      if (typeof val === 'object') {
        Object.assign(res, val);
      } else {
        res.width = val;
      }
      return res;
    });
  }
  desc.registers = registers;

  let localparams = desc.localparams || [];
  if (!Array.isArray(localparams) && typeof localparams === 'object') {
    localparams = Object.keys(localparams).map(name => ({name, expr: localparams[name]}));
  }
  desc.localparams = localparams;

  // desc.condition = desc.condition || '1\'b1';
  desc.clock = desc.clock || 'clock';
  desc.reset = desc.reset || 'reset';
  desc.width = desc.width || Math.ceil(Math.log2(states.length));
  desc.name = desc.name || 'FSM';
  if (desc.states.length > 0) {
    desc.initialState = desc.initialState || desc.states[0].name;
  }


};

const dim = e => {
  if ((typeof e.width !== 'number') || (e.width === 1)) {
    return '';
  }
  return '[' + (e.width - 1) + ':0] ';
};

const init = e => {
  if (e.init === undefined) {
    return '';
  }
  return ' = ' + e.init;
};

const regDefs = desc => [
  'reg [' + (desc.width - 1) + ':0] ' +
  desc.name + '_state, ' + desc.name + '_next;',
  ...(desc.registers).map((e =>
    'reg ' + dim(e) + e.name + ';'
  )),
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
    return 'wire ' + dim(e) + e.name + init(e) + ';';
  })),
  ''
];

const stateEnums = desc => {
  const maxW = desc.states.reduce(maxName, 2);
  return [
    '// ' + desc.name + ' state enums',
    ...(desc.states).map((state, idx) =>
      'wire [' + (desc.width - 1) + ':0] ' + desc.name + '_' + pad(maxW)(name(state)) + ' = ' + idx + ';'
    ),
    ''
  ];
};

const stateConds = desc => {
  const maxSN = desc.states.reduce((res, state) =>
    Math.max(res, name(state).length + (state.next || []).reduce(maxName, 2)), 2);

  const maxS = desc.states.reduce(maxName, 2);

  return [
    '// ' + desc.name + ' transition conditions',
    ...(desc.states).flatMap(state =>
      state.next.map(next =>
        'wire ' + desc.name + '_' + pad(maxSN + 1)(name(state, next)) +
        ' = ' +
        '(' +
          '(' + desc.name + '_state == ' + desc.name + '_' + pad(maxS)(name(state)) + ')' +
          ' & ' +
          '(' +
          (desc.condition
            ? (next.condition + ' == ' + desc.condition)
            : next.condition
          ) +
          ')' +
        ');'
      )
    ),
    ''
  ];
};

const entryConditions = desc => {
  const maxS = desc.states.reduce(maxName, 2);
  const res = ['// ' + desc.name + ' state entry conditions'];
  const o = {};
  desc.states.map(state => {
    state.next.map(next => {
      o[next.name] = o[next.name] || {};
      o[next.name][name(state)] = true;
    });
  });
  res.push(...Object.keys(o).map(to =>
    'wire ' + desc.name + '_' + pad(maxS + 8)(to + '_onEntry') + ' = (' +
    Object.keys(o[to]).map(from => [desc.name, from, to].join('_')).join(' | ') +
    ');'
  ), '');
  return res;
};

const exitConditions = desc => {
  const maxS = desc.states.reduce(maxName, 2);
  const res = [
    '// ' + desc.name + ' state exit conditions',
    ...(desc.states).map(state => {
      if (state.next.length === 0) {
        return '// ' + desc.name + '_' + name(state) + ' state has no exit';
      }
      return 'wire ' + desc.name + '_' + (name(state) + '_onExit').padEnd(maxS + 8) +
        ' = (' +
        state.next.map(next => name(desc, state, next)).join(' | ') +
        ');';
    }),
    ''
  ];
  return res;
};

const selfConditions = desc => {
  const maxS = desc.states.reduce(maxName, 2);
  const res = [
    '// ' + desc.name + ' state self conditions',
    ...(desc.states).map(state => {
      return 'wire ' + desc.name + '_' + (name(state) + '_onSelf').padEnd(maxS + 8) +
        ' = (' + name(desc, 'state') + ' == ' + desc.name + '_' + pad(maxS)(name(state)) + ') & ~' +
        name(desc, state, 'onExit') +
        ';';
    }),
    ''
  ];
  return res;
};

const selectNext = desc => {
  const maxSN = desc.states.reduce((res, state) =>
    Math.max(res, name(state).length + state.next.reduce(maxName, 2)), 2);

  return [
    '// ' + desc.name + ' next state select',
    'always @(*) begin : ' + desc.name + '_next_select',
    '  case (1\'b1)',
    ...(desc.states).flatMap(state =>
      state.next.map(next =>
        '    ' + desc.name + '_' + pad(maxSN + 2)(name(state, next)) + ': ' +
        desc.name + '_next = ' + name(desc, next) + ';'
      )
    ),
    pad(maxSN + desc.name.length + 7)('    default') + ': ' + desc.name + '_next = ' + desc.name + '_state;',
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

const cases = (res, act, name) => {
  if (act) {
    if (Array.isArray(act)) {
      if (act.length > 0) {
        res.push(
          '      ' + name + ' : begin',
          ...act.map(e => '        ' + e + ';'),
          '      end'
        );
      }
    } else
    if (typeof act === 'object') {
      const keys = Object.keys(act);
      if (keys.length > 0) {
        res.push(
          '      ' + name + ' : begin',
          ...keys.map(key => '        ' + key + ' <= ' + act[key] + ';'),
          '      end'
        );
      }
    } else {
      res.push(
        '      ' + name + ' : begin',
        '        ' + act.toString() + ';',
        '      end'
      );
    }
  }
};

const flipFlopActions = desc => {
  const restCond = desc.asyncReset || desc.syncReset || 'rst';

  const inits = [];
  desc.registers.map(reg => {
    inits.push('    ' + reg.name + ' <= ' + (reg.init || 0) + ';');
  });

  const trans = [];
  desc.states.map(state => {
    state.next.map(next => {
      cases(trans, next.act || next.actions, name(desc, state, next));
    });
  });

  const exits = [];
  desc.states.map(state => {
    cases(exits, state.onExit, name(desc, state, 'onExit'));
  });

  const entries = [];
  desc.states.map(state => {
    cases(entries, state.onEntry, name(desc, state, 'onEntry'));
  });

  const selves = [];
  desc.states.map(state => {
    cases(selves, state.onSelf, name(desc, state, 'onSelf'));
  });

  if ([trans, entries, exits, selves].reduce((res, e) => res + e.length, 0) === 0) {
    return [];
  }

  return [
    '// ' + desc.name + ' actions',
    'always @(posedge ' + desc.clock + asyncResetEdge(desc) + ')',
    '  if (' + restCond + ') begin',
    ...inits,
    '  end else begin',
    ...((trans.length === 0) ? [] : [
      '    case (1\'b1)',
      ...trans,
      '    endcase'
    ]),
    ...((entries.length === 0) ? [] : [
      '    case (1\'b1)',
      ...entries,
      '    endcase'
    ]),
    ...(((exits.length === 0) && (selves.length === 0)) ? [] : [
      '    case (1\'b1)',
      ...exits,
      ...selves,
      '    endcase'
    ]),
    '  end',
    ''
  ];
};

const alwaysAscii = desc => {
  if (!desc.ascii) {
    return [];
  }
  const maxS = desc.states.reduce(maxName, 2);
  return [
    'reg [' + (maxS * 8 - 1) + ':0] ' + desc.name + '_state_ascii;',
    'always @(*)',
    '  case ({' + desc.name + '_state})',
    ...(desc.states).map(state =>
      '    ' + desc.name + '_' + pad(maxS)(name(state)) + ' : ' + desc.name + '_state_ascii = "' + pad(maxS)(name(state)) + '";'
    ),
    pad(maxS + 8)('    default') + ' : ' + desc.name + '_state_ascii = "' + pad(maxS)('%Error') + '";',
    '  endcase',
    ''
  ];
};

const emitVerilog = (desc) => {
  if (typeof desc !== 'object') {
    return;
  }
  normDesc(desc);
  if (desc.states.length === 0) {
    return '// empty';
  }
  return [
    ...regDefs(desc),
    ...localparamDefs(desc),
    ...wireDefs(desc),
    ...stateEnums(desc),
    ...stateConds(desc),
    ...entryConditions(desc),
    ...exitConditions(desc),
    ...selfConditions(desc),
    ...selectNext(desc),
    ...flipFlopState(desc),
    ...flipFlopActions(desc),
    ...alwaysAscii(desc)
  ].join('\n');
};

module.exports = emitVerilog;
