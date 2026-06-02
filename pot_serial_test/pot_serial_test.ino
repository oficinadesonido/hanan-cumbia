/* HANAN CUMBIA - Diagnostico de potenciometros
 * -------------------------------------------------------------
 * Sketch temporal SOLO para medir. No genera audio.
 *
 * Uso:
 *   1) Abri el Monitor Serie a 115200 baudios.
 *   2) Move un pote a la vez y mira que columna cambia:
 *        - si cambia A0  -> es el pote conectado a A0 (en el firmware = pot2 / bass)
 *        - si cambia A1  -> es el pote conectado a A1 (en el firmware = pot1 / tick)
 *   3) Lleva el pote "problematico" a su MINIMO (donde el sample queda flotando)
 *      y anota el valor "raw" y el "incremento" que muestra esa columna.
 *
 * El "incremento" se calcula igual que el firmware (con la inversion ya aplicada),
 * asi vemos directamente que valor de fase produce el problema.
 */

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println(F("== Diagnostico de potes HANAN =="));
  Serial.println(F("Move cada pote y observa que columna cambia."));
  Serial.println(F("Lleva el pote al minimo y anota raw / incremento."));
  Serial.println();
}

void loop() {
  int a0 = analogRead(A0);
  int a1 = analogRead(A1);

  // mismo calculo que el firmware (lectura invertida)
  int pot2 = ((1023 - a0) >> 2) + 1; // incremento del pote en A0  (bass)
  int pot1 = ((1023 - a1) >> 1) + 1; // incremento del pote en A1  (tick/conga)

  Serial.print(F("A0 raw="));
  Serial.print(a0);
  Serial.print(F("\tincremento(pot2)="));
  Serial.print(pot2);
  Serial.print(F("\t\t|\tA1 raw="));
  Serial.print(a1);
  Serial.print(F("\tincremento(pot1)="));
  Serial.println(pot1);

  delay(150);
}
