// Island entry of the portfolio calculator, German (Archiv-Issue 33): imports only this
// language's catalogue. Pages use this file with client:load.
import { DE } from '../i18n/de';
import BasketCalculator from './BasketCalculator';

export default function BasketCalculatorDe({ data }: { data: string }) {
  return <BasketCalculator data={data} L={DE} />;
}
