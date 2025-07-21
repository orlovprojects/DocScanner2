import React from "react";
import { Container, Typography, Box, Link } from "@mui/material";

const Article = () => {
  return (
    <Container maxWidth="md">
        <Typography variant="h1" sx={{ marginBottom: 0, fontSize: { xs: '28px', sm: '46px' }, fontFamily: 'Helvetica', fontWeight: "bold" }}>
        LEAKED: New Huawei Smartphone Features Squarish Design and Movable Camera Lens
        </Typography>
        <Typography sx={{ marginTop: 1, marginBottom: 5, fontSize: '16px', fontStyle: "italic", fontWeight: "100"}}>
        Published: 24/03/2025
        </Typography>



        <Box sx={{ textAlign: "center", marginY: 2 }}>
           <img src="/huawei_smartphone_with_movable_lens.jpg" alt="Huawei smartphone with movable camera lens" style={{ width: "95%" }} />
        </Box>
        <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 3 }}>
        Huawei smartphone with movable camera lens | Image: Seasonality Chart
        </Typography>
        <Typography sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
        Huawei appears to be following in the footsteps of Apple and Samsung with a
        {" "} 
           <Box component="span" sx={{ fontWeight: "bold" }}>
              <Link href="https://drive.google.com/file/d/1I8z5A7OLr9Iat9dwmgVDiJ2R95fDlxfl/view?usp=sharing" target="_blank" sx={{ textDecoration: "none", color: "inherit" }}>
               new patent
               </Link>
           </Box>
        {" "}, thanks to our collab with <Box component="span" sx={{ fontWeight: "bold" }}>David from @xleaks7</Box>, that hints at a shift toward rectangular, squarish smartphone designs.
      </Typography>

      <Typography sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
        But it’s not just about shape - this patent introduces something much more dynamic: a movable camera lens system designed to improve zoom without bulking up the phone.
        If you thought smartphone camera innovations had plateaued, Huawei is out to prove otherwise.
      </Typography>
        <Box sx={{ textAlign: "center", marginY: 2 }}>
           <img src="/huawei_smartphone_with_movable_lens_2.jpg" alt="Back view with movable camera lens" style={{ width: "95%" }} />
        </Box>
        <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 1 }}>
        Back view with movable camera lens | Image: Seasonality Chart
        </Typography>

      <Typography variant="h2" sx={{ marginTop: 5, marginBottom: 2, fontSize: { xs: '30px', sm: '36px' }, fontFamily: 'Helvetica', fontWeight: "bold" }}>
        The Problem
      </Typography>

      <Typography sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
        Modern smartphones need to be slim, powerful, and photography-friendly - but these goals often clash.
        Especially when it comes to zoom capabilities, adding more hardware usually means compromising on thinness.
      </Typography>

      <Typography sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
        Traditional zoom mechanisms increase the phone’s thickness, making it harder to maintain a sleek design. Huawei's new invention aims to tackle this issue head-on.
      </Typography>
      <Box sx={{ textAlign: "center", marginY: 2 }}>
           <img src="/huawei_smartphone_with_movable_lens_3.jpg" alt="Back camera module" style={{ width: "95%" }} />
        </Box>
        <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 1 }}>
        Back camera module | Image: Seasonality Chart
        </Typography>

      <Typography variant="h2" sx={{ marginTop: 5, marginBottom: 2, fontSize: { xs: '30px', sm: '36px' }, fontFamily: 'Helvetica', fontWeight: "bold" }}>
        The Design
      </Typography>

      <Typography sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
        Based on the images in the patent, Huawei is going all-in on a squarish, symmetrical design aesthetic.
        The corners are more defined, the edges straighter - drawing a clear line to recent trends set by Apple’s iPhone and Samsung’s Galaxy S Ultra lineup.
      </Typography>

      <Typography sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
        Huawei’s version, however, adds a twist: a prominent circular camera bump that holds the entire movable lens mechanism.
      </Typography>

      <Typography variant="h2" sx={{ marginTop: 5, marginBottom: 2, fontSize: { xs: '30px', sm: '36px' }, fontFamily: 'Helvetica', fontWeight: "bold" }}>
        Key Features
      </Typography>

      <Box component="ul" sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 3, paddingLeft: 3, fontFamily: 'Helvetica' }}>
        <li><Box component="span" sx={{ fontWeight: 'bold' }}>Improved Zoom Performance:</Box> The movable lens allows for longer zoom ranges without sacrificing image quality</li>
        <li><Box component="span" sx={{ fontWeight: 'bold' }}>Sleek Design:</Box> The lifting mechanism tucks away when not in use, letting Huawei keep the device thin and stylish</li>
        <li><Box component="span" sx={{ fontWeight: 'bold' }}>Manual or Automatic Control:</Box> In some configurations, users can even manually control the zoom through a rotating ring, offering a tactile photography experience</li>
        <li><Box component="span" sx={{ fontWeight: 'bold' }}>Cost Efficiency:</Box> Simpler mechanical parts can be cheaper and easier to manufacture and maintain</li>
      </Box>





        
        {/* <Typography sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
        Last year, Apple introduced a dedicated camera control button on the iPhone 16, making it easier for users to snap pictures without fiddling with on-screen controls.
        Now, Samsung is making its move with an innovative solution - side sensors for camera control.
        </Typography>
        
        <Typography sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
        This new{" "} 
           <Box component="span" sx={{ fontWeight: "bold" }}>
              <Link href="https://drive.google.com/file/d/1rtjs46HtMg6D_xYmuXTi9nB338rY78iz/view?usp=sharing" target="_blank" sx={{ textDecoration: "none", color: "inherit" }}>
               patent
               </Link>
           </Box>
        {" "}reveals, thanks to our collab with David from @xleaks7, a way for users to interact with their smartphone cameras through simple swipe and push gestures on the side buttons of the device.
        Let’s dive deeper into the new technology.
        </Typography>
        <Box sx={{ textAlign: "center", marginY: 2 }}>
           <img src="/samsung_camera_control_sensors.jpg" alt="Samsung introduces camera control sensors on the side buttons" style={{ width: "95%" }} />
        </Box>
        <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 1 }}>
            Samsung introduces camera control sensors on the side buttons | Image: Seasonality Chart
        </Typography>
        
        <Typography variant="h2" sx={{ marginTop: 5, marginBottom: 2, fontSize: { xs: '30px', sm: '36px' }, fontFamily: 'Helvetica', fontWeight: "bold" }}>The Problem</Typography>
        
        <Typography sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
        Taking photos on a smartphone often requires users to tap the screen, which can be awkward – especially when holding the phone with one hand.
        The problem becomes even more noticeable when trying to adjust settings like zoom, exposure, or focus.
        Touching the screen while framing a shot can lead to shaky images and blocked views.
        </Typography>
        
        <Typography sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
        Samsung’s patent aims to solve this by introducing touch-sensitive side sensors that let users control the camera without touching the display.
        With simple swipe gestures, users can tweak camera settings without obstructing their view of the subject.
        </Typography>
        
        <Typography variant="h2" sx={{ marginTop: 5, marginBottom: 2, fontSize: { xs: '30px', sm: '36px' }, fontFamily: 'Helvetica', fontWeight: "bold" }}>How Do the Sensors Work?</Typography>
        
        <Typography component="ul" sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 3, paddingLeft: 3 }}>
        <li>A vertical swipe on the side sensor adjusts one camera function (e.g., zoom or brightness)</li>
        <li>A horizontal swipe changes another function (e.g., switching camera modes or focusing on a subject)</li>
        <li>The system provides haptic feedback (small vibrations) to confirm actions</li>
        </Typography>
        <Box sx={{ textAlign: "center", marginY: 2 }}>
           <img src="/samsung_camera_control_sensors_recognised_commands.jpg" alt="Commands recognised by Samsung's camera control sensors" style={{ width: "95%" }} />
        </Box>
        <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 1 }}>
            Commands recognised by Samsung's camera control sensors | Image: Seasonality Chart
        </Typography>
        
        <Typography sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, marginTop: 3, fontFamily: 'Helvetica' }}>
        The sensors only activate when the camera app is in use, preventing accidental inputs during normal phone usage.
        This setup allows users to make quick adjustments while keeping their eyes on the subject, making it much easier to capture the perfect shot.
        </Typography>
        
        <Typography variant="h2" sx={{ marginTop: 5, marginBottom: 2, fontSize: { xs: '30px', sm: '36px' }, fontFamily: 'Helvetica', fontWeight: "bold" }}>What Else Can Side Sensors Be Used For?</Typography>
        
        <Typography component="ul" sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 3, paddingLeft: 3 }}>
        <li>Gallery Navigation – Swipe through images and videos in the gallery app</li>
        <li>Image Editing – Adjust filters, crop images, or rotate photos using swipe gestures</li>
        <li>Switching Between Apps – Possibly flipping between different sections of the gallery or other media apps</li>
        </Typography> */}
        <Typography
            sx={{
                lineHeight: 1.5,
                fontSize: "18px",
                letterSpacing: "0.1px",
                marginTop: 5,
                marginBottom: "200px",
                alignItems: "center",
                backgroundColor: '#f2f2f2',
                padding: 3,
                fontFamily: 'Helvetica',
            }}
            >
            <Box component="span" sx={{ fontWeight: "bold" }}>NOTE TO EDITORS:</Box> The text and visuals of this article are the intellectual property of <Box component="span" sx={{ fontWeight: "bold" }}>Seasonality Chart</Box>. If you want to share the content, please give a proper clickable credit. Thanks for understanding.
        </Typography>
    </Container>






    // <Container maxWidth="md">
    //     <Typography variant="h1" sx={{ marginBottom: 0, fontSize: { xs: '28px', sm: '46px' }, fontFamily: 'Helvetica', fontWeight: "bold" }}>
    //         Samsung’s First Rollable Smartphone Might Have Four Cameras – Patent Reveals Exciting Details
    //     </Typography>
    //     <Typography sx={{ marginTop: 1, marginBottom: 5, fontSize: '16px', fontStyle: "italic", fontWeight: "100"}}>
    //         Published: 04/02/2023
    //     </Typography>
    //     <Typography sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
    //         While Samsung continues dominating the foldable phone market, they've apparently continued working on something even more revolutionary: rollable smartphones.
    //     </Typography>
    //     <Typography sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
    //         A fascinating{" "} 
    //         <Box component="span" sx={{ fontWeight: "bold" }}>
    //             <Link href="https://drive.google.com/file/d/1QcNduA5kFq9Bkz2X1D7m4MEHv6o7Dybp/view" target="_blank" sx={{ textDecoration: "none", color: "inherit" }}>
    //             patent
    //             </Link>
    //         </Box>
    //         {" "}just uncovered, thanks to our collab with{" "}
    //         <Box component="span" sx={{ fontWeight: "bold" }}>
    //             David from @xleaks7
    //         </Box>
    //         , shows Samsung isn't just dipping their toes in rollable tech - they're diving in headfirst with a design that includes a new digitizer system and, surprisingly, four cameras.
    //     </Typography>
    //     <Box sx={{ textAlign: "center", marginY: 2 }}>
    //         <img src="/samsung_first_rollable_with_four_back_cameras.jpg" alt="Samsung first rollable with four back cameras" style={{ width: "95%" }} />
    //     </Box>
    //     <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 1 }}>
    //         Samsung first rollable with four back cameras | Image: Seasonality Chart
    //     </Typography>

    //     <Typography variant="h2" sx={{ marginTop: 5, marginBottom: 2, fontSize: { xs: '30px', sm: '36px' }, fontFamily: 'Helvetica', fontWeight: "bold" }}>The Patent</Typography>
    //     <Typography variant="body1" sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
    //     The patent was filed on September 27, 2024, indicating that Samsung is seriously considering including four cameras for its first rollable smartphone, which might be released in 2025.
    //     </Typography>

    //     <Typography variant="body1" sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
    //     For reference, the Samsung Galaxy Z Fold 6 has 3 rear cameras:
    //     </Typography>

    //     <Typography component="ul" sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 3, paddingLeft: 3 }}>
    //         <li>Main (wide) camera: 50MP</li>
    //         <li>Telephoto camera: 10MP</li>
    //         <li>Ultra-wide camera: 12MP</li>
    //     </Typography>

    //     <Typography variant="body1" sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
    //     Meanwhile, the Samsung Galaxy S25 Ultra features four rear cameras:
    //     </Typography>

    //     <Typography component="ul" sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 3, paddingLeft: 3 }}>
    //         <li>Main (wide) camera: 200MP</li>
    //         <li>Ultra-wide camera: 50MP</li>
    //         <li>Periscope telephoto camera: 50MP</li>
    //         <li>Telephoto camera: 10MP</li>
    //     </Typography>

    //     <Typography variant="body1" sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
    //     It appears Samsung has decided to make its first rollable smartphone revolutionary by incorporating the best hardware available at the time. As shown in the drawings, the four cameras along with a flash are arranged in a single vertical line, similar to the Samsung Galaxy Z Fold 6.
    //     </Typography>
    //     <Box sx={{ textAlign: "center", marginY: 2 }}>
    //         <img src="/samsung_first_rollable_with_four_back_cameras_front_view.jpg" alt="Samsung first rollable with four back cameras front view" style={{ width: "95%" }} />
    //     </Box>
    //     <Typography sx={{ lineHeight: 1.5, fontSize: "16px", letterSpacing: "0.1px", marginBottom: 1 }}>
    //         Samsung first rollable with four back cameras - front view | Image: Seasonality Chart
    //     </Typography>




    //     <Typography variant="h2" sx={{ marginTop: 5, marginBottom: 2, fontSize: { xs: "30px", sm: "36px" }, fontFamily: "Helvetica", fontWeight: "bold" }}>
    //     The Digitizer
    //     </Typography>

    //     <Typography variant="body1" sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
    //     Samsung's new patent shows more than just a rollable phone—it reveals a special touch-sensing system made for screens that can roll up. Regular touch screens aren't built to bend and stretch, which creates a problem for rollable phones.
    //     </Typography>

    //     <Typography variant="body1" sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
    //     Samsung's solution is a flexible touch system that works perfectly no matter how the screen is rolled. This means you could draw or tap with the same accuracy whether the screen is small or fully stretched out. This is especially important for people who use stylus pens for drawing or taking notes.
    //     </Typography>

    //     <Typography variant="body1" sx={{ lineHeight: 1.5, fontSize: "18px", letterSpacing: "0.1px", marginBottom: 1, fontFamily: 'Helvetica' }}>
    //     This technology could also make rollable phones last longer. By creating a touch system that bends naturally with the screen, Samsung may have solved one of the biggest challenges in making rollable phones that remain reliable over time.
    //     </Typography>
      
    //     <Typography
    //         sx={{
    //             lineHeight: 1.5,
    //             fontSize: "18px",
    //             letterSpacing: "0.1px",
    //             marginTop: 5,
    //             marginBottom: "200px",
    //             alignItems: "center",
    //             backgroundColor: '#f2f2f2',
    //             padding: 3,
    //             fontFamily: 'Helvetica',
    //         }}
    //         >
    //         <Box component="span" sx={{ fontWeight: "bold" }}>NOTE TO EDITORS:</Box> The text and visuals of this article are the intellectual property of <Box component="span" sx={{ fontWeight: "bold" }}>Seasonality Chart</Box>. If you want to share the content, please give a proper clickable credit. Thanks for understanding.
    //     </Typography>
    // </Container>
  );
};

export default Article;