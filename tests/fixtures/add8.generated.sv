// Generated from EXPERIMENTAL Oreslang hardware subset
// Unsigned arithmetic wraps at output width
module ores_add8(
    input logic [7:0] in_a,
    input logic [7:0] in_b,
    output logic [7:0] out_result
);
    assign out_result = (in_a + in_b);
endmodule
