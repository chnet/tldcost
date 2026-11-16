// Island entry of the price table, German (Archiv-Issue 33): imports only this language's
// catalogue, so the page ships one catalogue. Pages use this file with client:load.
import { DE } from '../i18n/de';
import PriceTable from './PriceTable';

export default function PriceTableDe({ data }: { data: string }) {
  return <PriceTable data={data} L={DE} />;
}
