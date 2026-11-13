export type Language = 'uz' | 'ru';
export type Mode = 'practice' | 'exam';
export type Verification = 'supplied' | 'verified-dimensions' | 'estimated';
export type Vec2 = { x: number; z: number };
export type Localized = Record<Language, string>;
export type ExerciseId = 'start' | 'pedestrian' | 'hill' | 'rightAngle' | 'intersection' | 'snake' | 'garage' | 'railway' | 'acceleration' | 'emergency' | 'parallel' | 'finish';
export interface Waypoint extends Vec2 { reverse?: boolean }
export interface Exercise {
  id: ExerciseId; name: Localized; instruction: Localized;
  point: Vec2; spawn: Vec2; yaw: number; radius: number;
  stop?: { point: Vec2; normal: Vec2; light?: boolean };
  parking?: {
    center: Vec2; yaw: number; width: number; length: number;
    controlLine?: { points: [Vec2,Vec2]; width: number; wheels: readonly number[] };
  };
  timeLimit?: number; indicator?: 'left' | 'right';
}
export interface CourseDefinition {
  id: string; laneWidth: number; hillGradient: number; scale: number;
  verification: Verification; roads: { points: Vec2[]; width: number; smooth: boolean }[];
  exercises: Exercise[]; route: Waypoint[];
}
export interface VehicleConfig {
  length: number; width: number; height: number; wheelbase: number; mass: number;
  frontTrack: number; rearTrack: number; wheelRadius: number; tyreWidth: number; rimDiameter: number; groundClearance: number;
  idleRpm: number; redlineRpm: number;
  gearRatios: number[]; reverseRatio: number; finalDrive: number; maxTorque: number;
  verification: Verification;
}
export interface VehicleTelemetry {
  time: number; position: Vec2; yaw: number;
  /** Speed along the supporting road plane, or horizontal speed when airborne, in m/s. */
  speed: number; signedSpeed: number;
  rpm: number; gear: number; throttle: number; brake: number; clutch: number;
  /** Actual handwheel angle / mechanical handwheel lock, including speed/grip limits. */
  steering: number; engine: boolean; stalled: boolean; belt: boolean; handbrake: boolean;
  indicator: 'off' | 'left' | 'right'; hazards: boolean;
  ignition:boolean;positionLights:boolean;headlights:boolean;fogLights:boolean;
  bumper: Vec2; wheels: Vec2[]; collision: boolean;
}
export interface RuleDefinition {
  id: number; points: number; severity: 'minor' | 'medium' | 'major';
  text: Localized; source: string; verification: Verification;
  repeat?: 'event' | '5seconds';
}
export interface ExamEvent { ruleId: number; time: number; points: number; exercise: ExerciseId; key: string }
export interface ExamResult { date: string; mode: Mode; guided?: boolean; elapsed: number; score: number; passed: boolean; completed: boolean; events: ExamEvent[] }
export interface Settings {
  cockpitVersion:4;
  cockpit:import('./render/cockpit-view').CockpitView;
  curbStyle:'yellow-black'|'white';
  mirrors:import('./render/mirror-adjustment').MirrorAdjustments;
  language: Language; quality: 'low' | 'medium' | 'high'; volume: number;
  assist: boolean; steeringAssist: boolean; examMinutes: number; bindings: Record<string, string>; results: ExamResult[];
}
