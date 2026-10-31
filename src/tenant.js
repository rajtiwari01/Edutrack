const TENANT_TABLES = new Set([
  'users', 'departments', 'branches', 'courses', 'semesters', 'academic_sessions',
  'student_profiles', 'subjects', 'enrollments', 'class_sessions', 'attendance',
  'moderator_permissions', 'web_sessions', 'student_access_codes', 'audit_logs',
  'class_routines', 'routine_periods', 'college_holidays'
]);

const RESERVED = new Set([
  'AS','ON','WHERE','JOIN','LEFT','RIGHT','FULL','INNER','CROSS','OUTER','NATURAL',
  'GROUP','ORDER','HAVING','LIMIT','OFFSET','UNION','EXCEPT','INTERSECT','RETURNING',
  'SET','VALUES','FROM','INDEXED','NOT','WINDOW'
]);

function tokens(sql) {
  const out = [];
  let depth = 0;
  for (let i = 0; i < sql.length;) {
    const c = sql[i];
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      i++;
      while (i < sql.length) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { i += 2; continue; }
          i++; break;
        }
        i++;
      }
      continue;
    }
    if (c === '[') {
      i++;
      while (i < sql.length && sql[i] !== ']') i++;
      i++;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '(') { out.push({ value: '(', start: i, end: i + 1, depth }); depth++; i++; continue; }
    if (c === ')') { depth--; out.push({ value: ')', start: i, end: i + 1, depth }); i++; continue; }
    if (/[A-Za-z_]/.test(c)) {
      const start = i++;
      while (i < sql.length && /[A-Za-z0-9_$]/.test(sql[i])) i++;
      out.push({ value: sql.slice(start, i).toUpperCase(), raw: sql.slice(start, i), start, end: i, depth });
      continue;
    }
    i++;
  }
  return out;
}

function quoteTenant(id) {
  return `'${String(id).replaceAll("'", "''")}'`;
}

function scopeSelects(sql, tenantId) {
  const ts = tokens(sql), edits = [], id = quoteTenant(tenantId);
  for (let i = 0; i < ts.length; i++) {
    const select = ts[i];
    if (select.value !== 'SELECT') continue;
    let fromIndex = -1;
    for (let j = i + 1; j < ts.length; j++) {
      if (ts[j].depth < select.depth) break;
      if (ts[j].depth === select.depth && ts[j].value === 'FROM') { fromIndex = j; break; }
    }
    if (fromIndex < 0) continue;
    const table = ts[fromIndex + 1];
    if (!table || table.depth !== select.depth || !TENANT_TABLES.has(table.raw?.toLowerCase())) continue;
    let alias = table.raw;
    let aliasIndex = fromIndex + 2;
    if (ts[aliasIndex]?.depth === select.depth && ts[aliasIndex].value === 'AS') aliasIndex++;
    if (ts[aliasIndex]?.depth === select.depth && ts[aliasIndex].raw && !RESERVED.has(ts[aliasIndex].value)) alias = ts[aliasIndex].raw;

    let where = null, end = sql.length;
    for (let j = fromIndex + 1; j < ts.length; j++) {
      const t = ts[j];
      if (t.depth < select.depth) { end = t.start; break; }
      if (t.depth !== select.depth) continue;
      if (t.value === 'WHERE' && !where) where = t;
      if (['GROUP','ORDER','HAVING','LIMIT','UNION','EXCEPT','INTERSECT','RETURNING'].includes(t.value)) { end = t.start; break; }
      if (select.depth > 0 && t.value === ')' && t.depth === select.depth) { end = t.start; break; }
    }
    const condition = `${alias}.college_id=${id}`;
    if (where) edits.push({ at: end, text: ` AND ${condition} ` });
    else edits.push({ at: end, text: ` WHERE ${condition} ` });
  }
  for (const edit of edits.sort((a, b) => b.at - a.at)) sql = sql.slice(0, edit.at) + edit.text + sql.slice(edit.at);
  return sql;
}

function matchingParen(sql, open) {
  let depth = 0;
  const ts = tokens(sql.slice(open));
  for (const token of ts) {
    if (token.value === '(') depth++;
    else if (token.value === ')' && --depth === 0) return open + token.start;
  }
  return -1;
}

function scopeInsert(sql, tenantId) {
  const m = sql.match(/^\s*INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/i);
  if (!m || !TENANT_TABLES.has(m[1].toLowerCase())) return sql;
  const table = m[1].toLowerCase(), columnsStart = sql.indexOf('(', m.index + m[0].indexOf('('));
  const columnsEnd = matchingParen(sql, columnsStart);
  if (columnsEnd < 0) return sql;
  if (/\bcollege_id\b/i.test(sql.slice(columnsStart + 1, columnsEnd))) return sql;
  const valuesMatch = /\bVALUES\s*\(/i.exec(sql.slice(columnsEnd + 1));
  if (!valuesMatch) return sql;
  const valuesStart = columnsEnd + 1 + valuesMatch.index + valuesMatch[0].lastIndexOf('(');
  const valuesEnd = matchingParen(sql, valuesStart);
  if (valuesEnd < 0) return sql;
  const id = quoteTenant(tenantId);
  return sql.slice(0, columnsEnd) + ',college_id' + sql.slice(columnsEnd, valuesEnd) + `,${id}` + sql.slice(valuesEnd);
}

function scopeMutation(sql, tenantId) {
  const ts = tokens(sql);
  const update = ts.find(t => t.value === 'UPDATE');
  const del = ts.find(t => t.value === 'DELETE');
  let table = null, alias = null, start = -1;
  if (update) {
    const t = ts[ts.indexOf(update) + 1];
    if (t && TENANT_TABLES.has(t.raw?.toLowerCase())) { table = t; start = ts.indexOf(t); }
  } else if (del) {
    const from = ts.findIndex((t, i) => i > ts.indexOf(del) && t.value === 'FROM');
    const t = ts[from + 1];
    if (t && TENANT_TABLES.has(t.raw?.toLowerCase())) { table = t; start = from + 1; }
  }
  if (!table) return sql;
  alias = table.raw;
  let aliasToken = ts[start + 1];
  if (aliasToken?.value === 'AS') aliasToken = ts[start + 2];
  if (aliasToken?.raw && aliasToken.depth === table.depth && !RESERVED.has(aliasToken.value)) alias = aliasToken.raw;
  const id = quoteTenant(tenantId);
  const where = ts.find(t => t.value === 'WHERE' && t.depth === table.depth && t.start > table.end);
  const returning = ts.find(t => t.value === 'RETURNING' && t.depth === table.depth && t.start > table.end);
  const at = returning?.start ?? sql.length;
  return where
    ? sql.slice(0, at) + ` AND ${alias}.college_id=${id} ` + sql.slice(at)
    : sql.slice(0, at) + ` WHERE ${alias}.college_id=${id} ` + sql.slice(at);
}

export function scopeTenantSql(sql, tenantId) {
  if (typeof sql !== 'string' || !tenantId) return sql;
  if (/^\s*SELECT\b/i.test(sql) || /^\s*WITH\b/i.test(sql)) return scopeSelects(sql, tenantId);
  if (/^\s*INSERT\b/i.test(sql)) return scopeInsert(sql, tenantId);
  if (/^\s*(UPDATE|DELETE)\b/i.test(sql)) return scopeMutation(sql, tenantId);
  return sql;
}

export function tenantDatabase(binding, collegeId) {
  if (!collegeId) throw new TypeError('A college scope is required.');
  return {
    collegeId,
    prepare(sql) { return binding.prepare(scopeTenantSql(sql, collegeId)); },
    batch(statements) { return binding.batch(statements); }
  };
}
