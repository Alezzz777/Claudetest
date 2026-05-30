export class CreateUserCommand {
  constructor(
    public readonly email: string,
    public readonly displayName: string,
    public readonly keycloakId: string,
    public readonly tenantId: string,
    public readonly correlationId: string,
  ) {}
}
