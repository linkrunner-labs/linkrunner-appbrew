/**
 * Minimal stand-in for `@gauntlet/analytics`'s `AnalyticsTrackerV2`.
 *
 * Mirrors the fields and no-op methods of
 * `@gauntlet/analytics/src/analytics-tracker-v2.ts` that `LinkrunnerTrackerV2`
 * overrides or reads. Queue draining is reproduced so the override of
 * `processBacklogEventsFromQueue` can be exercised.
 */
export class AnalyticsTrackerV2 {
  eventQueue: { event: any; payload: any }[] = []
  screenViewEventQueue: { screenName: string }[] = []
  setUserEventQueue: { user: any }[] = []
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
    while (this.eventQueue.length > 0) {
      const { event, payload } = this.eventQueue.shift() || {}
      void this.sendEvent(event, payload)
    }
    while (this.screenViewEventQueue.length > 0) {
      const { screenName } = this.screenViewEventQueue.shift() || {}
      void this.sendScreenView(screenName)
    }
    while (this.setUserEventQueue.length > 0) {
      const { user } = this.setUserEventQueue.shift() || {}
      void this.setUserDetails(user)
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
