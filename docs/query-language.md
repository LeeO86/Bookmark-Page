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

Clicking a tag adds it with AND. Shift-click uses OR. Alt-click uses NOT. `/` focuses the query, and Escape clears it.
