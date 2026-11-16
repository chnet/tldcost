// Island entry of the price table, English (Archiv-Issue 33): imports only this language's
// catalogue, so the page ships one catalogue. Pages use this file with client:load.
import { EN } from '../i18n/en';
import PriceTable from './PriceTable';

export default function PriceTableEn({ data }: { data: string }) {
  return <PriceTable data={data} L={EN} />;
}
