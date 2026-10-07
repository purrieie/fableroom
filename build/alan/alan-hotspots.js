  /* ---- hotspots: the Alan's own detail copy ----
     Positions are in the engine's normalised space (footprint one unit
     across, base on y = 0), measured off this mesh: the drum runs from
     y 0.231 to 0.4375 at radius 0.5, and the four legs sit on its outside
     face at 13, 103, -167 and -77 degrees, from the floor up to y 0.3525.
     Copy restates the live PDP; nothing here is a new product claim. */
  var HOTSPOTS=[
    {id:'top',at:[0.10,0.4375,-0.05],normal:[0,1,0],bias:0.08,no:'Detail 01',title:'The Solid Mango Top',
     body:'Solid mango wood with a natural finish. The grain changes board to board, so no two tops match.',
     view:{theta:0.5,phi:38,dist:0.75,ty:0.40}},
    {id:'drum',at:[0.265,0.33,0.424],normal:[0.53,0,0.848],bias:0.25,no:'Detail 02',title:'The Round Drum',
     body:'Blocks of mango wood are stacked into a deep, round body, so the grain shows all the way round.',
     view:{theta:0.56,phi:80,dist:0.6,ty:0.33}},
    {id:'leg',at:[0.497,0.12,0.115],normal:[0.974,0,0.225],bias:0.25,no:'Detail 03',title:'Black Metal Legs',
     body:'Four slim metal legs in a black finish add contrast and an industrial touch.',
     view:{theta:1.34,phi:80,dist:0.82,ty:0.12}},
    {id:'joint',at:[-0.115,0.30,0.497],normal:[-0.225,0,0.974],bias:0.25,no:'Detail 04',title:'Fixed to the Outside',
     body:'Each leg runs up the outside of the drum rather than sitting underneath it, framing the wood.',
     view:{theta:-0.23,phi:76,dist:0.62,ty:0.20}},
    {id:'size',at:[0.41,0.43,0.287],normal:[0.7,0.4,0.49],bias:0.2,no:'Detail 05',title:'80 cm Across, 35 cm High',
     body:'A round top with no corners, so it is easy to move around in a compact living room.',
     view:{theta:0.96,phi:66,dist:0.95,ty:0.22}}
  ];
