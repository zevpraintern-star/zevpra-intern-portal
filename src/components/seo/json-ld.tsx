/**
 * Structured data. JSON.stringify output is made safe for embedding in a <script> by
 * escaping "<" (so a value like "</script>" cannot break out), which is why this is the
 * one place dangerouslySetInnerHTML is acceptable: the data is ours, serialised, and escaped.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
