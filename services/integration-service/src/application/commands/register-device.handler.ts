import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class RegisterDeviceCommand {
  constructor(
    public readonly deviceId: string,
    public readonly protocol: string,
    public readonly unsPath: string,
    public readonly correlationId?: string,
  ) {}
}

@CommandHandler(RegisterDeviceCommand)
export class RegisterDeviceHandler implements ICommandHandler<RegisterDeviceCommand> {
  private readonly logger = new Logger(RegisterDeviceHandler.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(cmd: RegisterDeviceCommand): Promise<void> {
    await this.prisma.deviceProjection.upsert({
      where: { deviceId: cmd.deviceId },
      update: {
        status: 'ONLINE',
        protocol: cmd.protocol,
        unsPath: cmd.unsPath,
        updatedAt: new Date(),
        lastSeenAt: new Date(),
      },
      create: {
        deviceId: cmd.deviceId,
        status: 'ONLINE',
        protocol: cmd.protocol,
        unsPath: cmd.unsPath,
        lastSeenAt: new Date(),
      },
    });
    this.logger.log(`Device registered: ${cmd.deviceId} (${cmd.protocol})`);
  }
}
