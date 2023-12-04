'use strict';

const namePattern = '^[A-Za-z_][A-Za-z0-9_]*$';

const expressionPattern = '.+';

const name = {
  type: 'string',
  pattern: namePattern
};

const condition = {
  type: 'string'
};

const expression = {
  type: 'string',
  pattern: expressionPattern
};

const actions = {
  type: 'object',
  propertyNames: {
    pattern: namePattern
  },
  additionalProperties: expression
};

const next = {
  oneOf: [{
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: name,
        condition: condition,
        actions: actions
      }
    }
  }, {
    type: 'object',
    propertyNames: {
      pattern: namePattern
    },
    additionalProperties: condition
  }]
};


const states = {
  oneOf: [{
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: name,
        next: next,
        onEntry: actions,
        onExit: actions,
        onSelf: actions
      }
    }
  }, {
    type: 'object',
    propertyNames: {
      pattern: namePattern
    },
    additionalProperties: next
  }]
};

const fsm = {
  type: 'object',
  title: 'fsm',
  description: 'Finite State Machine description',
  properties: {
    name: {
      ...name,
      description: 'name of the machine, will be used as prefix',
      default: 'FSM'
    },
    clock: {
      ...name,
      description: 'clock signal name',
      default: 'clock'
    },
    reset: {
      ...expression,
      description: 'synchronous reset name',
      default: 'reset'
    },
    asyncReset: {
      ...expression,
      description: 'asynchronous reset name'
    },
    condition: {
      ...expression,
      description: 'common condition for all state transitions'
    },
    draw: {
      type: 'string',
      enum: ['dot', 'circo'],
      description: 'diagram rendering engine',
      default: 'dot'
    },
    ascii: {
      type: 'boolean',
      description: 'Additional debug signal with ASCII name of the state'
    },
    initialState: {
      ...name,
      description: 'name of the initial state'
    },
    width: {
      type: 'integer',
      minimum: 1,
      description: 'width of the state register. default=log2(numberOfStates)'
    },
    states: states
  }
};

module.exports = fsm;
