'use strict';

const chai = require('chai');

const lib = require('../lib/index.js');

const expect = chai.expect;

const testo = {
  t1: {
    src: () => ({
      asyncReset: '~reset_n',
      states: {
        foo: {bar: 1},
        bar: {foo: 1}
      }
    }),
    dot: (`\
digraph g {
node [ style=rounded; shape=rect ]
foo [  ]
bar [  ]
foo -> bar [label="1"]
bar -> foo [label="1"]
}`
    ),
    verilog: (`\
reg [0:0] FSM_state, FSM_next;



// FSM state enums
wire [0:0] FSM_foo = 0;
wire [0:0] FSM_bar = 1;

// FSM transition conditions
wire FSM_foo_bar = ((FSM_state == FSM_foo) & (1));
wire FSM_bar_foo = ((FSM_state == FSM_bar) & (1));

// FSM state enter conditions
wire FSM_bar_onEnter = (FSM_foo_bar);
wire FSM_foo_onEnter = (FSM_bar_foo);
// FSM state exit conditions
wire FSM_foo_onExit  = (FSM_foo_bar);
wire FSM_bar_onExit  = (FSM_bar_foo);

// FSM next state select
always @(*) begin : FSM_next_select
  case (1'b1)
    FSM_foo_bar : FSM_next = FSM_bar;
    FSM_bar_foo : FSM_next = FSM_foo;
    default     : FSM_next = FSM_state;
  endcase
end

always @(posedge clock or negedge reset_n)
  if (~reset_n) FSM_state <= FSM_foo;
  else          FSM_state <= FSM_next;
`
    )
  }
};

Object.keys(testo).map(tName => {
  const test = testo[tName];
  const fsm = test.src();
  describe(tName, () => {
    it('dot', () => {
      expect(lib.emit.dot(fsm)).to.eq(test.dot);
    });
    it('verilog', () => {
      expect(lib.emit.verilog(fsm)).to.eq(test.verilog);
    });
  });
});

/* eslint-env mocha */
