/* ============================================================
 *  HANAN CUMBIA - Test de CONTINUIDAD Nano -> DAC (GPIO lento)
 *  ------------------------------------------------------------
 *  NO usa SPI. Mueve los 3 pines del bus a mano, MUY lento
 *  (1 Hz: 1 s en alto, 1 s en bajo), todos a la vez:
 *    D10 = CS   -> U1 pin 2
 *    D11 = MOSI -> U1 pin 4 (SDI)
 *    D13 = SCK  -> U1 pin 3   (y LED onboard del Nano)
 *
 *  El LED onboard (D13) debe PARPADEAR claro, 1 s on / 1 s off.
 *
 *  QUE HACER (multimetro en DC, punta - a GND):
 *    1) Mira el LED onboard:
 *         - Parpadea lento  -> el Nano corre este sketch. OK.
 *         - NO parpadea      -> la placa no corre el codigo
 *           (mal upload / placa equivocada / Nano no arranca).
 *    2) Con el LED parpadeando, mide en cada pin del U1:
 *         U1 pin 2 (CS)  debe oscilar 0 <-> 5 V con el LED
 *         U1 pin 3 (SCK) debe oscilar 0 <-> 5 V con el LED
 *         U1 pin 4 (SDI) debe oscilar 0 <-> 5 V con el LED
 *       El pin que quede PLANO (0V fijo o 5V fijo) tiene la
 *       pista o la soldadura ABIERTA entre el Nano y el DAC.
 *       Ese es el fallo.
 * ============================================================ */

void setup() {
  pinMode(10, OUTPUT);   // CS  -> U1 pin 2
  pinMode(11, OUTPUT);   // MOSI/SDI -> U1 pin 4
  pinMode(13, OUTPUT);   // SCK -> U1 pin 3  (+ LED onboard)
}

void loop() {
  digitalWrite(10, HIGH);
  digitalWrite(11, HIGH);
  digitalWrite(13, HIGH);
  delay(1000);
  digitalWrite(10, LOW);
  digitalWrite(11, LOW);
  digitalWrite(13, LOW);
  delay(1000);
}
