// Island entry of the portfolio calculator, English (Archiv-Issue 33): imports only this
// language's catalogue. Pages use this file with client:load.
import { EN } from '../i18n/en';
import BasketCalculator from './BasketCalculator';

export default function BasketCalculatorEn({ data }: { data: string }) {
  return <BasketCalculator data={data} L={EN} />;
}
