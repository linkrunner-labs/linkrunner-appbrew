/**
 * Minimal stand-in for `@gauntlet/analytics`'s `AnalyticsTrackerV2`.
 *
 * Mirrors the fields and no-op methods of
 * `@gauntlet/analytics/src/analytics-tracker-v2.ts` that `LinkrunnerTrackerV2`
 * overrides or reads. Queue draining is reproduced so the override of
 * `processBacklogEventsFromQueue` can be exercised.
 */
export class AnalyticsTrackerV2 {
  // The real base keeps ONE private backlog queue. It has no eventQueue /
  // screenViewEventQueue / setUserEventQueue — those are on the v1
  // AnalyticsTracker, which this class does not extend.
  protected backlogQueue: { event: any; payload: any }[] = []
  protected trackerName = 'StubTrackerV2'
  initialized = false
  eventsMapper: Record<string, string> = {}
  paramsMapper: Record<string, string> = {}
  eventsWhitelist: any[] = []
  paramsWhitelist: any[] = []

  async initTracker(_config?: any): Promise<void> {}
  async sendEvent(_e?: any, _p?: any, _d?: any): Promise<void> {}
  async sendScreenView(_s?: string): Promise<void> {}
  async setUserDetails(_u?: any): Promise<void> {}

  processBacklogEventsFromQueue(): void {
    for (const { event, payload } of this.backlogQueue.splice(0)) {
      void this.sendEvent(event, payload)
    }
  }

  init(config?: any) {
    if (!this.initialized) {
      void this.initTracker(config).then(() => {
        this.initialized = true
        this.processBacklogEventsFromQueue()
      })
    }
  }
}
