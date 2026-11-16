// Controls (design system): TLD, VAT mode, provider search and column picker. Every value lives in
// the URL (url-state.ts); nothing is stored. Filters apply as you type or select, no submit button.
import { useLocale } from '../i18n/context';
import { COLUMNS } from '../lib/columns';
import type { ViewState } from '../lib/url-state';
import { MAX_QUERY } from '../lib/url-state';

export interface ControlsProps {
  tlds: readonly string[];
  state: ViewState;
  /** Columns shown as checked (the explicit selection or the device default). */
  chosen: readonly string[];
  update: (patch: Partial<ViewState>) => void;
  toggleColumn: (id: string, on: boolean) => void;
}

const PICKABLE = COLUMNS.filter((c) => c.id !== 'provider');

export default function Controls({ tlds, state, chosen, update, toggleColumn }: ControlsProps) {
  const L = useLocale();
  const t = L.m.controls;
  const checked = PICKABLE.filter((c) => chosen.includes(c.id)).length;
  return (
    <form class="tc-controls" role="search" onSubmit={(e) => e.preventDefault()}>
      {tlds.length > 1 ? (
        <label class="tc-field">
          <span>{t.tld}</span>
          <select
            class="tc-select"
            id="tld"
            name="tld"
            value={state.tld}
            onChange={(e) => update({ tld: (e.currentTarget as HTMLSelectElement).value })}
          >
            {tlds.map((t) => (
              <option key={t} value={t}>
                .{t}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p class="tc-field tld-static">
          <span>{t.tld}</span>
          <span class="tc-static">.{state.tld}</span>
        </p>
      )}
      <fieldset class="tc-field">
        <legend>{t.prices}</legend>
        <div class="tc-segment">
          {(['gross', 'net'] as const).map((v) => (
            <label key={v}>
              <input
                type="radio"
                name="vat"
                value={v}
                checked={state.vat === v}
                onChange={() => update({ vat: v })}
              />
              <span>{v === 'gross' ? L.m.common.gross : L.m.common.net}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label class="tc-field">
        <span>{t.search}</span>
        <input
          class="tc-search"
          type="search"
          id="q"
          name="q"
          value={state.q}
          maxLength={MAX_QUERY}
          placeholder={t.searchPlaceholder}
          autoComplete="off"
          spellcheck={false}
          onInput={(e) => update({ q: (e.currentTarget as HTMLInputElement).value })}
        />
      </label>
      <details class="tc-colpicker cols">
        <summary>{t.columns(checked, PICKABLE.length)}</summary>
        <ul>
          {PICKABLE.map((c) => (
            <li key={c.id}>
              <label>
                <input
                  type="checkbox"
                  name="cols"
                  value={c.id}
                  checked={chosen.includes(c.id)}
                  onChange={(e) =>
                    toggleColumn(c.id, (e.currentTarget as HTMLInputElement).checked)
                  }
                />{' '}
                {L.m.columns[c.id]?.label ?? c.id}
              </label>
            </li>
          ))}
        </ul>
      </details>
    </form>
  );
}
