type GeneratedObject = {
  id: string;
  sourcePlacedObjectId: string;
  meshType: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
};

function padTo4(byteLength: number) {
  return (4 - (byteLength % 4)) % 4;
}

export function buildMockGlb(sceneId: string, objects: GeneratedObject[]): Buffer {
  const jsonDoc = {
    asset: { version: '2.0', generator: 'SnapSpace Export Worker' },
    scene: 0,
    scenes: [{ nodes: objects.map((_, idx) => idx) }],
    nodes: objects.map((obj) => ({
      name: obj.meshType,
      translation: [obj.position.x, obj.position.y, obj.position.z],
      scale: [obj.scale.x, obj.scale.y, obj.scale.z],
      extras: {
        sourcePlacedObjectId: obj.sourcePlacedObjectId,
        rotationY: obj.rotation.y,
        sceneId,
        generatedObjectId: obj.id
      }
    }))
  };

  const jsonBytes = Buffer.from(JSON.stringify(jsonDoc), 'utf8');
  const jsonPadding = padTo4(jsonBytes.length);
  const paddedJson =
    jsonPadding > 0 ? Buffer.concat([jsonBytes, Buffer.alloc(jsonPadding, 0x20)]) : jsonBytes;

  const totalLength = 12 + 8 + paddedJson.length;
  const glb = Buffer.alloc(totalLength);

  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLength, 8);

  glb.writeUInt32LE(paddedJson.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  paddedJson.copy(glb, 20);

  return glb;
}
