// Text of a footnote or a data quote (NoteText, src/lib/payload.ts): plain text, or parts where
// data text in another language than the page is marked: German data text (promo conditions,
// editorial notes) lang="de" on English pages, an English provider quote lang="en" on German pages.
import type { NoteText } from '../lib/payload';

export default function NoteBody({ text }: { text: NoteText }) {
  if (typeof text === 'string') return <>{text}</>;
  return (
    <>
      {text.map((part, i) =>
        typeof part === 'string' ? (
          part
        ) : 'de' in part ? (
          <span key={i} lang="de">
            {part.de}
          </span>
        ) : (
          <span key={i} lang="en">
            {part.en}
          </span>
        ),
      )}
    </>
  );
}
