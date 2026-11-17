import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { PrismaClient } from "@prisma/client"

function isTransientConnectionError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === "P1001" || code === "P2024"
}

/**
 * Supabase's pooler occasionally drops a connection with P1001/P2024. Those
 * errors mean the query never reached Postgres, so a single short retry is
 * safe and keeps an in-flight report save from failing on a transient blip.
 */
export async function withDbRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!isTransientConnectionError(error)) throw error
    await new Promise((resolve) => setTimeout(resolve, 350))
    return operation()
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
