export class ApplicationCreatedEvent {
  constructor(
    public readonly applicationId: number,
    public readonly userId: number,
    public readonly projectId: number,
    public readonly roleId: number,
  ) {}
}
