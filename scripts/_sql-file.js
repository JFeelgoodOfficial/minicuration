'use strict'
// Splits a .sql file into individual statements so they can be sent one at a
// time over Neon's HTTP driver (which takes one statement per call). Written
// by hand rather than pulled from a package because it only has to understand
// this repo's SQL — but it does have to understand it properly: naively
// splitting on ';' would cut claim_edition's body in half at its first
// statement, since a plpgsql function is one statement containing many.
//
// So it tracks the four places a ';' does not end a statement: inside a
// dollar-quoted block ($$ … $$), a single-quoted string, a line comment, or a
// block comment.
function splitStatements(sql) {
  const statements = []
  let current = ''
  let i = 0
  let inLineComment = false
  let inBlockComment = false
  let inString = false
  let dollarTag = null

  while (i < sql.length) {
    const ch = sql[i]
    const next = sql[i + 1]

    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      current += ch; i++; continue
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; current += '*/'; i += 2; continue }
      current += ch; i++; continue
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) { current += dollarTag; i += dollarTag.length; dollarTag = null; continue }
      current += ch; i++; continue
    }
    if (inString) {
      if (ch === "'" && next === "'") { current += "''"; i += 2; continue }  // escaped quote
      if (ch === "'") inString = false
      current += ch; i++; continue
    }

    if (ch === '-' && next === '-') { inLineComment = true; current += '--'; i += 2; continue }
    if (ch === '/' && next === '*') { inBlockComment = true; current += '/*'; i += 2; continue }
    if (ch === "'") { inString = true; current += ch; i++; continue }

    const dollar = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i))
    if (dollar) { dollarTag = dollar[0]; current += dollarTag; i += dollarTag.length; continue }

    if (ch === ';') { statements.push(current); current = ''; i++; continue }

    current += ch; i++
  }
  if (current.trim()) statements.push(current)

  // Drop fragments that are only comments and whitespace — the trailing
  // explanatory blocks in the schema file would otherwise be sent as queries.
  return statements
    .map(s => s.trim())
    .filter(s => s && s.split('\n').some(line => line.trim() && !line.trim().startsWith('--')))
}

module.exports = { splitStatements }
