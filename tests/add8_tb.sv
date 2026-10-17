// Exhaustive actual RTL simulation, not a software-only arithmetic check.
module add8_tb;
  reg [7:0] a, b;
  wire [7:0] result;
  integer i, j;
  reg [7:0] expected;
  add8 dut(.a(a), .b(b), .result(result));
  initial begin
    for (i=0; i<256; i=i+1) begin
      for (j=0; j<256; j=j+1) begin
        a=i; b=j; expected=(i+j) & 255;
        #1;
        if (result !== expected)
          $fatal(1, "mismatch at a=%0d b=%0d got=%0d expected=%0d", i,j,result,expected);
      end
    end
    $display("PASS: 65536 RTL vectors");
    $finish;
  end
endmodule
