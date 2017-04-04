(async function() {
  const vertexShader = fetch('vertex.glsl').then(r => r.text());
  const fragmentShader = fetch('fragment.glsl').then(r => r.text());
  const modules = [
    'Camera',
    'Helpers',
    'IndexManager',
    'Input',
    'Mesh',
    'Program',
    'SceneGraph',
    'VAO',
  ].reduce((acc, m) => Object.assign(acc, {[m]: SystemJS.import(`../dist/${m}.js`).then(m => m)}), {});
  const canvas = document.querySelector('canvas');
  const gl = canvas.getContext('webgl2');
  const {VAO} = await modules['VAO'];
  const {IndexManager} = await modules['IndexManager'];
  const {Program} = await modules['Program'];
  const planeVAO = new VAO(gl);
  const sphereVAO = new VAO(gl);
  const indexManager = new IndexManager();
  const program = new Program(gl)
    .setVertexShader(await vertexShader)
    .setFragmentShader(await fragmentShader);

  const {XYPlane, NormalizedCubeSphere} = await modules['Mesh'];

  const planeMesh = XYPlane.vertices();
  planeVAO.bind();
  planeVAO.createVBO()
    .bind()
    .setData(planeMesh.data)
    .setItemSize(3)
    .bindToIndex(indexManager.forName('vertex'));

  planeVAO.createVBO()
    .bind()
    .setData(
      new Float32Array(planeMesh.numPoints * 4).fill(1)
    )
    .setItemSize(4)
    .bindToIndex(indexManager.forName('color'));

  planeVAO.createVBO()
    .bind()
    .setNormalize(true)
    .setData(XYPlane.normals().data)
    .setItemSize(3)
    .bindToIndex(indexManager.forName('normal'));

  program
    .bindInVariable('in_vertex', indexManager.forName('vertex'))
    .bindInVariable('in_color', indexManager.forName('color'))
    .bindInVariable('in_normal', indexManager.forName('normal'));

  const sphereMesh = NormalizedCubeSphere.vertices();
  sphereVAO.bind();
  sphereVAO.createVBO()
    .bind()
    .setData(sphereMesh.data)
    .setItemSize(3)
    .bindToIndex(indexManager.forName('vertex'));

  sphereVAO.createVBO()
    .bind()
    .setData(
      new Float32Array(sphereMesh.numPoints * 4).fill(1)
    )
    .setItemSize(4)
    .bindToIndex(indexManager.forName('color'));

  sphereVAO.createVBO()
    .bind()
    .setNormalize(true)
    .setData(NormalizedCubeSphere.normals().data)
    .setItemSize(3)
    .bindToIndex(indexManager.forName('normal'));

  program
    .bindInVariable('in_vertex', indexManager.forName('vertex'))
    .bindInVariable('in_color', indexManager.forName('color'))
    .bindInVariable('in_normal', indexManager.forName('normal'));

  const {Camera} = await modules['Camera'];
  const camera =
    new Camera()
      .setAspectRatio(gl.canvas.width / gl.canvas.height)
      .setFov(45)
      .setNearPlane(0.1)
      .setFarPlane(1000);

  const {SceneGraph, Node} = await modules['SceneGraph'];
  const scene = new SceneGraph()
  .add(
      new Node('plane', {numPoints: planeMesh.numPoints, idx: 0, vao: planeVAO})
        .scale(100)
        .rotate([1, 0, 0], -90)
    )
    .add(
      new Node('player_move')
        .add(
          new Node('player_rot_y')
            .add(
              new Node('player_rot_x')
                .add(
                  new Node('player_camera', camera)
                )
            )
        )
        .move([0, 1.8, 0])
    );

  new Array(100).fill().forEach((_, idx) => {
    const y = Math.floor(idx / 10);
    const x = idx % 10;
    scene.add(
      new Node('sphere', {numPoints: sphereMesh.numPoints, idx: 0, vao: sphereVAO})
        .move([-50 + x*10, 5, -50 + y*10])
        .scale(5)
    );
  });

  program
    .link()
    .activate();

  const viewUniform = program.referenceUniform('view');
  const cameraUniform = program.referenceUniform('camera');
  const modelUniform = program.referenceUniform('model');

  const {Helpers} = await modules['Helpers'];
  gl.clearColor(0, 0, 0, 1);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  Helpers.autosize(gl, _ => {
    camera.setAspectRatio(gl.canvas.width / gl.canvas.height);
    viewUniform.setMatrix4(camera.viewMatrix);
  });
  viewUniform.setMatrix4(camera.viewMatrix);

  const {KeyboardState, MouseController} = await modules['Input'];
  const keyboard = new KeyboardState();
  const mouse = new MouseController(gl);
  const scratch = mat4.create();
  const ctrl = Helpers.loop(delta => {
    handleInput(keyboard, mouse, delta);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const flatScene = scene.flatten();
    const playerCamera = flatScene.find(entry => entry.node.name === 'player_camera');

    flatScene.forEach(entry => {
      if(!('idx' in entry.node.data)) return;
      entry.node.data.vao.bind();
      cameraUniform.setMatrix4(mat4.invert(scratch, playerCamera.accumulatedTransform));
      modelUniform.setMatrix4(entry.accumulatedTransform);
      gl.drawArrays(gl.TRIANGLES, entry.node.data.idx, entry.node.data.numPoints);
    });
  });

  let speed = 50;
  const playerRotX = scene.find(e => e.name === 'player_rot_x');
  const playerRotY = scene.find(e => e.name === 'player_rot_y');
  const playerMove = scene.find(e => e.name === 'player_move');
  let move = new Float32Array(3);
  function handleInput(keyboard, mouse, delta) {
    const {dx, dy} = mouse.delta();
    playerRotY.rotate([0, 1, 0], -dx);
    playerRotX.rotate([1, 0, 0], -dy);

    for(let key of keyboard) {
      move.fill(0);
      switch(key) {
        case 'KeyW':
          move[2] = -speed * delta/1000;
          break;
        case 'KeyA':
          move[0] = -speed * delta/1000;
          break;
        case 'KeyS':
          move[2] = speed * delta/1000;
          break;
        case 'KeyD':
          move[0] = speed * delta/1000;
          break;
        case 'Space':
          move[1] = speed * delta/1000;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          move[1] = -speed * delta/1000;
          break;
        case 'Comma':
          camera.setFov(camera.fov - 1);
          viewUniform.setMatrix4(camera.viewMatrix);
          break;
        case 'Period':
          camera.setFov(camera.fov + 1);
          viewUniform.setMatrix4(camera.viewMatrix);
          break;
      }
      playerMove.move(vec3.transformMat4(move, move, playerRotY.transform));
    }
  }

  document.addEventListener('keypress', event => {
    switch(event.code) {
      case 'KeyP':
        if(ctrl.isPaused)
          ctrl.play();
        else {
          ctrl.pause();
          mouse.free();
        }
        console.log(`Paused: ${ctrl.isPaused}`);
        break;
      case 'KeyM':
        ctrl.manual(16);
        break;
    }
  });

  canvas.addEventListener('click', event => {
    if(mouse.isCaptured()) return;
    mouse.capture();
  });
})();