import type { Prisma, PrismaClient, Report } from '@prisma/client';

export interface CreateReportParams {
  id?: string;
  caseId: string;
  status?: string;
  content: Prisma.InputJsonValue;
  version?: number;
}

export class ReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createReport(params: CreateReportParams): Promise<Report> {
    let version = params.version;
    if (version === undefined) {
      const latest = await this.prisma.report.findFirst({
        where: { caseId: params.caseId },
        orderBy: { version: 'desc' },
      });
      version = (latest?.version ?? 0) + 1;
    }

    return this.prisma.report.create({
      data: {
        ...(params.id !== undefined ? { id: params.id } : {}),
        caseId: params.caseId,
        version,
        status: params.status ?? 'PUBLISHED',
        content: params.content,
      },
    });
  }

  async getLatestReport(caseId: string): Promise<Report | null> {
    return this.prisma.report.findFirst({
      where: { caseId },
      orderBy: { version: 'desc' },
    });
  }

  async getByVersion(caseId: string, version: number): Promise<Report | null> {
    return this.prisma.report.findUnique({
      where: {
        caseId_version: {
          caseId,
          version,
        },
      },
    });
  }

  async listReports(caseId: string): Promise<Report[]> {
    return this.prisma.report.findMany({
      where: { caseId },
      orderBy: { version: 'desc' },
    });
  }
}
