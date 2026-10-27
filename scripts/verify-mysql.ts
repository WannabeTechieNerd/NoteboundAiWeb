import 'dotenv/config';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';
import { MySQLBackend } from '../src/server/mysqlBackend.ts';

async function main() {
  const host = (process.env.MYSQL_HOST || '127.0.0.1').trim();
  const port = Number(process.env.MYSQL_PORT || 3306);
  const user = process.env.MYSQL_USER || 'root';
  const dbName = (process.env.MYSQL_DATABASE || 'notebound_ai').replace(/[^a-zA-Z0-9_]/g, '');
  const useSsl = String(process.env.MYSQL_SSL || 'false').toLowerCase() === 'true';

  process.env.MYSQL_HOST = host;

  console.log('====================================================');
  console.log(' NoteBound AI — Local MySQL Verification Utility');
  console.log('====================================================');
  console.log(`Target Host     : ${host}:${port}`);
  console.log(`MySQL User      : ${user}`);
  console.log(`Target Database : ${dbName}`);
  console.log('----------------------------------------------------');

  try {
    const backend = new MySQLBackend();
    await backend.init();

    const conn = await mysql.createConnection({
      host,
      port,
      user,
      password: process.env.MYSQL_PASSWORD || '',
      database: dbName,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });

    const [tables] = await conn.query<RowDataPacket[]>('SHOW TABLES');
    console.log(`✅ Connected to MySQL and verified ${tables.length} tables in \`${dbName}\`:`);

    for (const row of tables) {
      const tableName = String(Object.values(row)[0]);
      const [[countRow]] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS cnt FROM \`${tableName}\``
      );
      console.log(`   • ${tableName.padEnd(24)} (${countRow?.cnt ?? 0} rows)`);
    }

    await conn.end();
    console.log('----------------------------------------------------');
    console.log('🎉 MySQL integration is ready! Start the app with:');
    console.log('   npm run dev');
    console.log('====================================================');
    process.exit(0);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ MySQL Connection Error: ${msg}`);
    console.error('----------------------------------------------------');
    console.error('Troubleshooting Checklist:');
    console.error('  1. Ensure you copied `.env.example` to `.env`.');
    console.error('  2. Check that your local MySQL Server service is running on port 3306.');
    console.error('  3. Verify `MYSQL_USER` and `MYSQL_PASSWORD` in `.env` match your MySQL credentials.');
    console.error('  4. Test login in terminal: mysql -h 127.0.0.1 -P 3306 -u root -p');
    console.error('====================================================');
    process.exit(1);
  }
}

main();
