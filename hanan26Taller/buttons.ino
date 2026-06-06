
void BUTTONS() {
  shift=digitalRead(2);

if (shift==0 && prevshift==1){
  shift_latch++;
  shift_latch%=2;}

prevshift=shift;
///////////////////////////////////////////////////sequence select

  if (shift==0&&recordbutton==1){
    prevpot2=pot2;
    if (bouncer1.read()==0 ){ //red
      banko=64;   // preset 3: 4*32 (era 63, corrido 1 paso -> salto al cambiar de preset)

      bankpr=4;
      bankpg=0;
      bankpb=0;
    }
    if (bouncer4.read()==0){  //yellow
      banko=32;   // preset 2: 2*32 (era 31, corrido 1 paso)
      bankpr=4;
      bankpg=4;
      bankpb=0;
    }
    if (bouncer2.read()==0 || banko==0){   //blue
      banko=0;
       bankpr=0;
      bankpg=0;
      bankpb=8;
    }
    if (bouncer3.read()==0){//green
      banko=96;   // preset 4: 3*32 (era 95, corrido 1 paso)
      bankpr=0;
      bankpg=3;
      bankpb=0;
      
    }


    if (bouncertap.read()==LOW){  //revsi hay que cambiarisar

        play=1;
        // A14 no tiene pote en esta placa (solo hay 2 potes: A0/A1). Leerlo daba
        // un valor flotante/basura que pisaba el BPM. Se deja el tempo por
        // defecto; para cambiarlo se usa tap-tempo (shift + tap) en LOOP.ino.
        // ratepot=((1023-analogRead(14)))<<4;
        // taptempo=ratepot<<4;
      }
        revbutton = digitalRead(17);
      if (revbutton==0 && prevrevbutton==1){
        playmode++;
        playmode%=2;
    
  }
prevrevbutton=revbutton;
}

  if (shift==1){
 if (bouncer1.fallingEdge()){
      B1_trigger=1;  
    }
    else{
      B1_trigger=0;
    }

 if (bouncer4.fallingEdge()){
      B4_trigger=1; 
    }
    else{
      B4_trigger=0;
    }

 if (bouncer2.fallingEdge()){
      B2_trigger=1; 
    }
    else{
      B2_trigger=0;
    }

 if (bouncer3.fallingEdge()){
      B3_trigger=1; 
    }
    else{
      B3_trigger=0;
    }



  }

  ////////////////////////////////////////////

}



