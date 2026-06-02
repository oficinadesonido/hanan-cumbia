unsigned long recordoffsettimer,offsetamount,taptempof;
int potX;

void loop() {
uint32_t now = readAudioClock(); // base de tiempo estable para todo el secuenciador
bouncertap.update ( );
bouncer1.update ( );
bouncer2.update ( );
bouncer4.update ( );
bouncer3.update ( );
 LEDS();
  BUTTONS();
  RECORD();

 // dd++;
 // if (dd==0){
//pot1=(1023-analogRead(1));
//  pot1=12;
//  pot2=256;
//pot2=((1023-analogRead(0)));

if (noise_mode==0)
{
pot1=(((1023-analogRead(1)))>>1)+2;
pot2=(((1023-analogRead(0)))>>2)+32;
}

if (noise_mode==1)
{
  if (shift_latch==0)
  {
pot1=(((1023-analogRead(1)))>>1)+1;
pot2=(((1023-analogRead(0)))>>2)+1;
  }
    if (shift_latch==1){

 pot3=((1023-analogRead(1)))<<4; ////////////////MAKE ME BETTERERER  
 pot4=(1023-analogRead(0))<<2;

}}

// Piso de pitch del pote A1 (tick/conga). Por debajo de ~21 el incremento de fase
// es tan chico que el sample no alcanza a reproducirse y queda "flotando".
// Valor medido en la placa: raw~982 -> incremento 21 (punto donde suena bien).
if (pot1 < 21) pot1 = 21;

 trigger_in_read=digitalRead(16);
 
 
  if (trigger_in_read==1 && prev_trigger_in_read==0)
  {
    trigger_input=1;
    if (ext_sync_mode == 1)
    {
      fake_taptempo = (now - fake_prevtap) >> 2;
      fake_prevtap = now;
    }
  }
  else
  {
    trigger_input=0;
  }

  prev_trigger_in_read=trigger_in_read;
  
  
  //////////////////////////////////////
  // trigger out
  
  eigth=loopstep%4;

  if(eigth==0)
  {
    digitalWrite(12, HIGH);
  }
  else
  {
    digitalWrite(12, LOW);
  }
  
  
  if (ext_sync_mode == 1)
  {
    taptempof=fake_taptempo;
    recordoffsettimer=now-fake_prev ;
    offsetamount=taptempof-(taptempof>>2 );
    if ((recordoffsettimer)>(offsetamount))
    {
      loopstepf=loopstep+1;
      loopstepf%=32;
    }
  }
  else
  {
taptempof=taptempo;
    recordoffsettimer=now-prev ;
    offsetamount=taptempof-(taptempof>>2 );
    if ((recordoffsettimer)>(offsetamount))
    {
      loopstepf=loopstep+1;
      loopstepf%=32;
    }
  }



  if (play==1)
  {
    if (onetime==1)
    {
      taptempo=5333333; // 90 BPM por defecto (taptempo = 480e6 / BPM, 8 pasos/beat)
      onetime=0;
    }
    else
    {
      prevloopstep=loopstep;
      preva=eigth;

      if (recordmode==1)
      {
        if (ext_sync_mode == 1)
        {
          if (trigger_input == 1)
          {
            fake_prev = now;
            loopstep++;
            loopstep%=32;
            fake_trig_cnt = 0;
          }
          else
          if (((now - fake_prev) > (fake_taptempo)) && (fake_trig_cnt < 3))
          {
            fake_prev = now;
            loopstep++;
            loopstep%=32;
            fake_trig_cnt ++;
          }
        }
        
        else if (now - prev > (taptempof) ) 
        {
          prev = now;    
          loopstep++;
          loopstep%=32;
        }
      }
    }


    B4_loop_trigger=B4_sequence[loopstep+banko];
    B1_loop_trigger=B1_sequence[loopstep+banko];
    B2_loop_trigger=B2_sequence[loopstep+banko];
    B3_loop_trigger=B3_sequence[loopstep+banko];
  }

  if (play==0){
    loopstep=0;
    prev==0;
    B4_loop_trigger=0;
    B1_loop_trigger=0;
    B2_loop_trigger=0;
    B3_loop_trigger=0;

  }

  if (loopstep!=prevloopstep && B3_loop_trigger==1){

    B3_seq_trigger=1;
    //freq3=kickfreqsequence[loopstepf];
  }
  else {
    B3_seq_trigger=0;
  }

  if (loopstep!=prevloopstep && B2_loop_trigger==1){

    B2_seq_trigger=1;
    //freq3=kickfreqsequence[loopstepf];
  }
  else {
    B2_seq_trigger=0;
  }

  if (loopstep!=prevloopstep && B4_loop_trigger==1){

    B4_seq_trigger=1;
    //freq3=kickfreqsequence[loopstepf];
  }
  else {
    B4_seq_trigger=0;
  }

  if (loopstep!=prevloopstep && B1_loop_trigger==1){

    B1_seq_trigger=1;
  }
  else {
    B1_seq_trigger=0;
  }
  
  
  
    if (B3_trigger==1 || B3_seq_trigger==1){
    index3=0;
    accumulator3=0;
    B3_latch=1;
  }

  if (B4_trigger==1 || B4_seq_trigger==1){
    index4=0;
    accumulator4=0;
    B4_latch=1;
  }
  if (B1_trigger==1){
    index=0;
    accumulator=0;
    B1_latch=1;
  }

  if (B1_seq_trigger==1){
    index_freq_1=0;
    accu_freq_1=0;
    B1_seq_latch=1;
  }
  if (B2_seq_trigger==1){
    index_freq_2=0;
    accu_freq_2=0;
    B2_seq_latch=1;
  }

  if (B2_trigger==1){
    index2=0;
    accumulator2=0;
    B2_latch=1;
  }

  
  
  
  
  //////////////////////////////////////////////////////////////// T A P
 //////////////////////////////////////////////////////////////// T A P
/*
  if (shift==1)
  {
      if (bouncertap.fallingEdge())
      {
        t++;
        t%=2;
        tapbank[t]=((now)-prevtap)>>2;
        taptempo=((tapbank[0]+tapbank[1])>>1);
        prevtap=now;
      }
  }
*/

  if (bouncertap.fallingEdge())
  {
    if (shift == 1) // shift nestisknut
    {
      t++;
      t%=2;
      tapbank[t]=((now)-prevtap)>>2;
      taptempo=((tapbank[0]+tapbank[1])>>1);
      prevtap=now;
    }
    else
    {
      ext_sync_mode ++;
      ext_sync_mode %= 2;
    }
  }
  
/*  if (ext_sync_mode == 1)
  {
    taptempo = (now - prevtap) >> 2;
    prevtap = now;
  }
  */
}


