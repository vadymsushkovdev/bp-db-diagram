export type SqlEnum = {
    name: string;
    values: string[];
};

export type SqlIndex = {
    name: string;
    table: string;
    unique: boolean;
    method?: string; // btree/gist/gin/brin/...
    expression: string; // whatever is inside "( ... )" after ON table
    include?: string; // raw "col1, col2"
    where?: string; // raw predicate
};

export type SqlColumn = {
    name: string;
    type: string;
    isPrimaryKey: boolean;
    isNotNull?: boolean;
    isForeignKey?: boolean;
    fkTo?: { table: string; column?: string };
    isEnum?: boolean;
    enumName?: string;
};


export type SqlTable = {
    name: string;
    columns: SqlColumn[];
    indexes: SqlIndex[];
};

export type SqlRelation = {
    id?: string;
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
};

export type SqlGraph = {
    tables: SqlTable[];
    relations: SqlRelation[];
    enums: SqlEnum[];
};

const stripComments = (input: string) =>
    input.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

const normalizeWs = (s: string) => s.replace(/\s+/g, ' ').trim();

const unquoteIdent = (s: string) => s.replace(/^"+|"+$/g, '').trim();

const normalizeTableName = (raw: string) => {
    const s = unquoteIdent(raw.trim());
    // keep schema-qualified if present: public.company -> company? you can keep full; for now keep last segment
    const parts = s.split('.');
    return parts[parts.length - 1];
};

const baseTypeOf = (t: string) => t.replace(/\[\]$/g, '').trim();

const splitTopLevelComma = (body: string) => {
    const parts: string[] = [];
    let start = 0;
    let depth = 0;
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < body.length; i++) {
        const ch = body[i];

        if (ch === "'" && !inDouble) inSingle = !inSingle;
        if (ch === '"' && !inSingle) inDouble = !inDouble;

        if (!inSingle && !inDouble) {
            if (ch === '(') depth++;
            if (ch === ')') depth = Math.max(0, depth - 1);

            if (ch === ',' && depth === 0) {
                parts.push(body.slice(start, i).trim());
                start = i + 1;
            }
        }
    }

    parts.push(body.slice(start).trim());
    return parts.filter(Boolean);
};

type Block =
    | { kind: 'create_table'; name: string; body: string }
    | { kind: 'create_type_enum'; name: string; values: string[] };

function parseCreateTableBlocks(sql: string): Array<{ name: string; body: string }> {
    const s = sql;
    const lower = s.toLowerCase();
    const out: Array<{ name: string; body: string }> = [];

    let i = 0;
    while (i < s.length) {
        const idx = lower.indexOf('create table', i);
        if (idx === -1) break;

        let p = idx + 'create table'.length;
        while (p < s.length && /\s/.test(s[p])) p++;

        // read name (quoted or unquoted; allow schema)
        let rawName = '';
        if (s[p] === '"') {
            p++;
            const start = p;
            while (p < s.length && s[p] !== '"') p++;
            rawName = s.slice(start, p);
            p++;
        } else {
            const start = p;
            while (p < s.length && /[A-Za-z0-9_."\.]/.test(s[p])) p++;
            rawName = s.slice(start, p);
        }
        const name = normalizeTableName(rawName);

        while (p < s.length && s[p] !== '(') p++;
        if (p >= s.length || s[p] !== '(') {
            i = p;
            continue;
        }

        const bodyStart = p + 1;
        p++;
        let depth = 1;
        let inSingle = false;
        let inDouble = false;

        while (p < s.length && depth > 0) {
            const ch = s[p];

            if (ch === "'" && !inDouble) inSingle = !inSingle;
            else if (ch === '"' && !inSingle) inDouble = !inDouble;
            else if (!inSingle && !inDouble) {
                if (ch === '(') depth++;
                else if (ch === ')') depth--;
            }

            p++;
        }

        const bodyEnd = p - 1;
        const body = s.slice(bodyStart, bodyEnd);

        out.push({ name, body });
        i = p;
    }

    return out;
}

function parseEnumTypes(sql: string): SqlEnum[] {
    // CREATE TYPE user_status_enum AS ENUM ('invited', 'active');
    const enums: SqlEnum[] = [];
    const re = /create\s+type\s+("?[\w.]+"?)\s+as\s+enum\s*\(([\s\S]*?)\)\s*;?/gi;

    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) {
        const name = normalizeTableName(m[1]);
        const body = m[2];

        // split quoted strings
        const values: string[] = [];
        const valRe = /'((?:''|[^'])*)'/g;
        let vm: RegExpExecArray | null;
        while ((vm = valRe.exec(body))) {
            values.push(vm[1].replace(/''/g, "'"));
        }
        enums.push({ name, values });
    }

    return enums;
}

export function parseSqlToGraph(sql: string): SqlGraph {
    const cleaned = stripComments(sql);

    const enums = parseEnumTypes(cleaned);
    const enumSet = new Set(enums.map((e) => e.name));

    // Index parsing (covers your file’s syntax)
    // Examples in pasted.txt:
    // create index idx_company_name on company (name);
    // create index idx_gps_location_location on gps_location using gist (location);
    // create index idx_gps_loc_prov_time_cover on gps_location (vehicle_provider_id, arrival_time) include (id, latitude, ...);
    // create index "IDX_service_event_company_createdat_diff" on service_event (...) where (...);
    const indexRe =
        /create\s+(unique\s+)?index\s+("?[^"\s;]+"?)\s+on\s+("?[\w.]+"?)\s*(?:using\s+(\w+)\s*)?\(([\s\S]*?)\)\s*(?:include\s*\(([\s\S]*?)\)\s*)?(?:where\s*\(([\s\S]*?)\)\s*)?;?/gi;

    const allIndexes: SqlIndex[] = [];
    let im: RegExpExecArray | null;
    while ((im = indexRe.exec(cleaned))) {
        const unique = Boolean(im[1]);
        const name = unquoteIdent(im[2]);
        const table = normalizeTableName(im[3]);
        const method = im[4]?.toLowerCase();
        const expression = normalizeWs(im[5]);
        const include = im[6] ? normalizeWs(im[6]) : undefined;
        const where = im[7] ? normalizeWs(im[7]) : undefined;

        allIndexes.push({ name, table, unique, method, expression, include, where });
    }

    const tableBlocks = parseCreateTableBlocks(cleaned);

    const tables: SqlTable[] = [];
    const relations: SqlRelation[] = [];
    const tableByName = new Map<string, SqlTable>();
    const pkByTable = new Map<string, string>(); // table -> pk column name (first found)

    // FK regexes
    const tableFkRe =
        /(?:constraint\s+"?[^"\s]+"?\s+)?foreign\s+key\s*\(\s*"?([\w]+)"?\s*\)\s+references\s+("?[\w.]+"?)\s*(?:\(\s*"?([\w]+)"?\s*\))?/i;

    // column-level REFERENCES:
    // logo_id integer constraint fk_company_logo references public_file on delete cascade
    // vehicle_id integer references vehicle on delete set null
    const colRefRe =
        /^"?([\w]+)"?\s+([\s\S]+?)\s+references\s+("?[\w.]+"?)\s*(?:\(\s*"?([\w]+)"?\s*\))?/i;

    for (const { name: tableName, body } of tableBlocks) {
        const items = splitTopLevelComma(body);
        const columns: SqlColumn[] = [];

        for (const item of items) {
            const line = normalizeWs(item);

            // table-level FK
            const fk = tableFkRe.exec(line);
            if (fk) {
                const fromColumn = unquoteIdent(fk[1]);
                const toTable = normalizeTableName(fk[2]);
                const toColumn = fk[3] ? unquoteIdent(fk[3]) : ''; // resolve later if missing

                relations.push({
                    fromTable: tableName,
                    fromColumn,
                    toTable,
                    toColumn, // may be empty for now
                    id: `${tableName}.${fromColumn}->${toTable}.${toColumn || '?'}`,
                });
                continue;
            }

            // ignore pure constraints / checks
            if (/^constraint\b/i.test(line) && !/\breferences\b/i.test(line)) continue;
            if (/^primary\s+key\b/i.test(line)) continue;
            if (/^unique\b/i.test(line)) continue;
            if (/^check\b/i.test(line)) continue;

            // column definition base
            const m = /^"?([\w]+)"?\s+(.+)$/.exec(line);
            if (!m) continue;

            const colName = unquoteIdent(m[1]);
            const rest = m[2];

            const isPk = /\bprimary\s+key\b/i.test(rest);
            const isNotNull = isPk || /\bnot\s+null\b/i.test(rest);

            // Get type token (allow timestamp with time zone, character varying, geometry(Point, 4326), user_status_enum[], etc.)
            // We take "first chunk" but keep "(...)" right after it, and allow multi-word known types.
            // For display we keep original-ish; for enum detection we use baseTypeOf(first token / enum[]).
            const typeMatch =
                /^\s*([a-zA-Z_]+)(\s+with\s+time\s+zone|\s+without\s+time\s+zone|\s+varying)?(\s*\([^\)]*\))?(\[\])?/i.exec(
                    rest
                );

            const type =
                typeMatch?.[0]
                    ? normalizeWs(typeMatch[0])
                    : normalizeWs(rest).split(' ')[0] ?? normalizeWs(rest);

            const col: SqlColumn = {
                name: colName,
                type,
                isPrimaryKey: isPk,
                isNotNull,
            };

            // mark PK for later FK resolution
            if (isPk && !pkByTable.has(tableName)) pkByTable.set(tableName, colName);

            // column-level references
            const r = colRefRe.exec(line);
            if (r) {
                const fromColumn = unquoteIdent(r[1]);
                const toTable = normalizeTableName(r[3]);
                const toColumn = r[4] ? unquoteIdent(r[4]) : undefined;

                col.isForeignKey = true;
                col.fkTo = { table: toTable, column: toColumn };

                relations.push({
                    fromTable: tableName,
                    fromColumn,
                    toTable,
                    toColumn: toColumn ?? '', // resolve later
                    id: `${tableName}.${fromColumn}->${toTable}.${toColumn ?? '?'}`,
                });
            }

            // enum detection (even if enum definition isn't present in the ddl dump)
            const base = baseTypeOf(type.replace(/\([^\)]*\)/g, ''));
            const enumName = normalizeTableName(base);
            if (enumSet.has(enumName) || /_enum$/i.test(enumName)) {
                col.isEnum = true;
                col.enumName = enumName;
            }

            columns.push(col);
        }

        const t: SqlTable = {
            name: tableName,
            columns,
            indexes: [],
        };

        tables.push(t);
        tableByName.set(tableName, t);
    }

    // Attach indexes to tables
    for (const idx of allIndexes) {
        const t = tableByName.get(idx.table);
        if (t) t.indexes.push(idx);
    }

    // Resolve missing FK target columns: references table (no column) => table PK if known, else 'id'
    const resolvedRelations: SqlRelation[] = relations
        .map((r) => {
            const toColumn = r.toColumn && r.toColumn.length > 0 ? r.toColumn : pkByTable.get(r.toTable) ?? 'id';
            return {
                ...r,
                toColumn,
                id: `${r.fromTable}.${r.fromColumn}->${r.toTable}.${toColumn}`,
            };
        })
        .filter((r) => tableByName.has(r.fromTable) && tableByName.has(r.toTable));

    // Mark FK columns based on resolved relations (table-level constraints)
    for (const rel of resolvedRelations) {
        const t = tableByName.get(rel.fromTable);
        if (!t) continue;
        const c = t.columns.find((x) => x.name === rel.fromColumn);
        if (!c) continue;
        c.isForeignKey = true;
        c.fkTo = { table: rel.toTable, column: rel.toColumn };
    }

    return { tables, relations: resolvedRelations, enums };
}
