export class DeactivateUserCommand {
  constructor(
    public readonly userId: string,
    public readonly correlationId: string,
  ) {}
}
