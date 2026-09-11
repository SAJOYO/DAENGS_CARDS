// Independent toy-body balance: card stats, foil rarity and profile identity are not strength.
// Ground distances are scene units, mass is relative, impulse/mass gives launch speed,
// and friction is constant speed loss per second (scene units/second²).
export const BODY_DEFS = Object.freeze({
  tomato: Object.freeze({
    id: 'tomato', name: '토마토', description: '가볍고 빠르게 · 멀리 미끄러져요',
    mass: 1, maxImpulse: 4.8, friction: 1.1, radius: .70, visualScale: 1,
  }),
  'sweet-potato': Object.freeze({
    id: 'sweet-potato', name: '고구마', description: '묵직하게 밀고 · 짧게 멈춰요',
    mass: 1.35, maxImpulse: 5.3, friction: 1.5, radius: .64, visualScale: 1,
  }),
});

export const ARENA = Object.freeze({
  radius: 4.2, maxShots: 20,
  fixedStep: 1 / 120, maxFrameDelta: .25,
  restSpeed: .055, settleHold: .16, maxShotSeconds: 9, fallSeconds: .8,
  minPower: .035, restitution: .65,
});
