import { db } from "@workspace/db";
import { tenantsTable, usersTable, devicesTable, logsTable } from "@workspace/db/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Iniciando seed de datos...");

  const existingTenants = await db.select().from(tenantsTable).limit(1);
  if (existingTenants.length > 0) {
    console.log("La base de datos ya tiene datos. Omitiendo seed.");
    process.exit(0);
  }

  const [tenant] = await db.insert(tenantsTable).values({
    name: "Empresa Demo",
  }).returning();

  console.log(`Tenant creado: ${tenant!.name} (${tenant!.id})`);

  const hashedPassword = await bcrypt.hash("admin1234", 10);
  const [adminUser] = await db.insert(usersTable).values({
    email: "admin@demo.com",
    password: hashedPassword,
    role: "admin",
    tenantId: tenant!.id,
  }).returning();

  console.log(`Usuario admin creado: ${adminUser!.email}`);

  const hashedOperatorPassword = await bcrypt.hash("operator1234", 10);
  await db.insert(usersTable).values({
    email: "operador@demo.com",
    password: hashedOperatorPassword,
    role: "operator",
    tenantId: tenant!.id,
  });

  console.log("Usuario operador creado: operador@demo.com");

  const deviceData = [
    { name: "TV Sala Principal", ip: "192.168.1.100" },
    { name: "TV Sala de Reuniones", ip: "192.168.1.101" },
    { name: "TV Recepción", ip: "192.168.1.102" },
  ];

  for (const d of deviceData) {
    const [device] = await db.insert(devicesTable).values({
      name: d.name,
      ip: d.ip,
      tenantId: tenant!.id,
      status: "unknown",
    }).returning();

    await db.insert(logsTable).values({
      deviceId: device!.id,
      message: `Dispositivo "${d.name}" registrado en la base de datos`,
      level: "info",
    });

    console.log(`Dispositivo creado: ${d.name} (${d.ip})`);
  }

  console.log("\nSeed completado exitosamente!");
  console.log("\nCredenciales de acceso:");
  console.log("  Admin:    admin@demo.com    / admin1234");
  console.log("  Operador: operador@demo.com / operator1234");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Error en seed:", err);
  process.exit(1);
});
