export type PipelineState =
  | "passing"
  | "failing"
  | "error"
  | "deploying"
  | "deploy_success"
  | "deploy_failed"
  | "pending"
  | "unknown";

export interface Provider {
  poll(owner: string, name: string): Promise<PipelineState>;
}
