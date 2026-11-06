# Query language

The query bar, saved filters, and `entry_info` use the same language. An empty query matches every entry the caller is allowed to see. Anonymous queries are still limited to public filters.

Space between terms means AND. `OR` and `AND` are operators. Parentheses group terms. `NOT` and a leading `-` negate the next term.

| Example                    | Meaning                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `mixer`                    | Name, description, host, or searchable field contains `mixer` |
| `"studio 1"`               | The phrase `studio 1`                                         |
| `type:audio`               | Tag `type:audio`                                              |
| `type:audio*`              | Tag namespace `type` whose value starts with `audio`          |
| `audio`                    | A tag with no namespace, or text                              |
| `type:audio OR type:video` | Either tag                                                    |
| `-status:spare`            | Entries that do not have tag `status:spare`                   |
| `is:up`                    | Current check status is up                                    |
| `is:down`                  | At least one check is down                                    |
| `is:unknown`               | No check, or a check whose status is unknown                  |
| `state:online`             | A check is up. Not a stored tag                               |
| `state:offline`            | A check is down. Not a stored tag                             |
| `state:unknown`            | A check exists and is unknown. No check is excluded           |
| `is:managed`               | The entry belongs to an Ansible scope                         |
| `is:unmanaged`             | The entry was created in the portal                           |
| `has:link`                 | The entry has a link                                          |
| `has:check`                | The entry has a check                                         |
| `has:note`                 | The entry has a value for field `note`                        |

`is:`, `state:`, and `has:` are reserved, so they are not tag namespaces. `has:link` and `has:check` are keywords, not field keys. `state:unknown` requires a check. `is:unknown` also matches an entry that has none.

A plain sidebar click selects a tag, switches a single selected value within its namespace, or removes the clicked selection (including duplicates). Shift-click uses OR. Alt-click uses NOT. Switching between positive and negated selection replaces the old term. Quoted values are matched by meaning, and the remaining boolean groups are preserved. Selected facets stay visible even at zero matches so they can be removed. `/` focuses the query, and Escape clears it.

Quote only a tag's value when it contains spaces or punctuation: `group:"Control Room"`, `room:"A (north)"`, or `#"plain tag"`. Escape quotes and backslashes inside values with a backslash. A fully quoted string such as `"group:Control Room"` remains a free-text phrase. Sidebar shortcuts and autocomplete produce the quoted-value syntax automatically.

Sidebar counts ignore their own namespace's terms for a simple top-level AND
query. With `group:A type:audio`, the Group section counts every group among the
audio entries, so `group:B` stays available and one click changes A to B. Type
counts keep `group:A`. Plain tags (`#blue`) and `state:*` use the same rule.
Negative terms of that namespace are excluded too. Saved-tab predicates and all
other filters remain constraints. Counts respect the caller's public visibility
and field permissions.

Selected values stay highlighted and appear first; other values retain their
existing order. Multiple selections created with OR remain multi-select; a plain
click only replaces when there is one selected value in that namespace. For a
manually typed OR/parenthesised query, counts keep their earlier filtered-result
behaviour. A sidebar edit preserves the remaining boolean expression. Saved
tabs, query-chip editing and shared URLs retain their existing semantics.
State counts for a simple query represent actual `state:*` matches: a device
with both up and down checks can match both online and offline. A device without
checks is excluded from `state:unknown`, as before. Typed complex queries retain
the previous rendered aggregate-state counts.
