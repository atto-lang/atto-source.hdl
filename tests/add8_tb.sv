module tb;
 logic [7:0] in_a,in_b;
 wire [7:0] out_result;
 ores_add8 dut(.in_a(in_a),.in_b(in_b),.out_result(out_result));
 integer a,b;
 initial begin
  for(a=0;a<256;a=a+1)begin
   for(b=0;b<256;b=b+1)begin
    in_a=a[7:0];in_b=b[7:0];#1;
    if(out_result !== ((a+b)&8'hff))$fatal(1,"mismatch a=%0d b=%0d",a,b);
   end
  end
  $display("HDL_ADD8_65536_PASS");$finish;
 end
endmodule
