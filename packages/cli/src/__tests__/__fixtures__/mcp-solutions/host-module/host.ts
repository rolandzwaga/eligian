/**
 * The host module of the host-module reference solution (spec 058 phase 3): `score` reads the
 * answer from the operation data, writes the message into the selected element and returns the
 * operation data.
 */
interface ScoreData {
  answer?: unknown;
  selectedElement?: { text(value: string): unknown };
  [key: string]: unknown;
}

export const operations = {
  score(operationData: ScoreData): ScoreData {
    const message = operationData.answer === 'b' ? 'Correct! 10 points' : 'Wrong answer. 0 points';
    operationData.selectedElement?.text(message);
    return operationData;
  },
};
