import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
// import cors = require('cors')

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
admin.initializeApp()

let email_from = 'goubi.webmaster@gmail.com'

let transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: email_from,
        pass: 'gmixafjbhypywlly'
    }
});


const messageObject = {
    "gas":{
        notification: {
            title: 'Nuevo Pedido',
            body: 'Nuevo pedido de gas'
        },
        topic: "gasRequest",
    },
    "water":{
        notification: {
            title: 'Nuevo Pedido',
            body: 'Nuevo pedido de agua'
        },
        topic: "waterRequest",
    },
    "recicle":{
        notification: {
            title: 'Nuevo Pedido',
            body: 'Nuevo pedido de reciclaje'
        },
        topic: "recicleRequest",
    },

};

const orderIdData= async (orderId: string | number | boolean | null,database:string) =>{
    return new Promise((resolve, reject) =>{
        const ref = admin.database().ref(database).orderByChild('orderid').equalTo(orderId);
        ref.once("value", function(snapshot) {
            snapshot.forEach(function(childSnapshot) {
                resolve(childSnapshot.key);
            });
          });
    })
};

const tokenIdUser = async (userId: string) =>{ 
    const ref = admin.firestore().collection("users").doc(userId);
    const doc = await ref.get();
    return doc.get('tokens') as Array<string>
};

export const onOrderCreate = functions.database
.ref('/requests/{orderId}')
.onCreate((snapshot,context)=>{
    let message;
    const data = snapshot.val()
    if (data.type == 'gas'){
        message = messageObject['gas']
    }
    else if(data.type == 'water'){
        message = messageObject['water']
    }
    else{
        message = messageObject['recicle']
    }

    admin.messaging()
        .send(message)
        .then((response) => {
            console.log("Successfully sent message:", response);
            return true
        })
        .catch((error) => {
            console.log("Error sending message:", error);
        });  
})


export const onChatReceived = functions.database
.ref('/chats/{orderId}/{messageId}')
.onCreate(async (snapshot,context)=> {
    let message;
    const data = snapshot.val()
    
    const orderId = context.params.orderId
    const clientResult = await orderIdData(orderId,"clientProgress");
    const deliveryResult = await orderIdData(orderId,"deliveryProgress");
    const clientToken = await tokenIdUser(clientResult as string);
    const deliveryToken = await tokenIdUser(deliveryResult as string);
    if (data['type'] === 'client'){
        message = {
            notification: {
                title: 'Mensaje de Cliente',
                body: data['text']
            },
            tokens: deliveryToken
        }
    }else{
        message = {
            notification: {
                title: 'Mensaje de Repartidor',
                body: data['text']
            },
            tokens: clientToken
        }
    }
    admin.messaging()
        .sendMulticast(message)
        .then((response) => {
            console.log("Successfully sent message:", response);
            return true
        })
        .catch((error) => {
            console.log("Error sending message:", error);
            return false
        });  
})


export const onCreateUser = functions.https.onRequest((req,res)=>{
    
    if(req.method == 'POST'){
        let headers = req.headers;
        let body = req.body;
        let envKey = process.env.KEY;
        if ('api-key' in headers){
            if (headers['api-key'] == envKey){
                let fullname = `${body.firstname} ${body.lastname}`
                let number =''
                if (body.phone.length == 10){
                    let substring = body.phone.substring(1);
                    number = `+593${substring}`
                }
                else{
                    res.send({sucess:false
                            ,error:{
                            code:"noenoughLen"}})
                    
                }
                admin.auth().createUser({
                    email: body.email,
                    emailVerified: false,
                    phoneNumber: number,
                    password: body.password,
                    displayName: fullname,
                    disabled: false,
                })
                .then(async (userRecord) => {
                    //let link = await admin.auth().generateEmailVerificationLink(userRecord.email!);
                    console.log('Successfully created new user:', userRecord.uid);
                
                    admin.firestore().collection('users').doc(userRecord.uid).set({
                        email:body.email,
                        lastname:body.lastname,
                        name:body.firstname,
                        phone:number,
                        cedula: body.cedula ? body.cedula : "NA",
                        placa: body.placa ? body.placa : "NA",
                        type:body.type,
                        status:true
                    }).then((info)=>{
                        res.send({sucess:true,body:info})
                    }).catch((error) => {
                        res.send({sucess:false,body:'cant create user on db',error:error})
                      });
                    
                  })
                  .catch((error) => {
                    res.send({sucess:false,body:'cant create user on auth',error:error})
                  });
            }else{
                res.send('api key doesnt match')
            }
        }else{
            res.send('no api key found')   
        }      
    }else{
        res.send('Only post method allow')
    }
}) 

export const sendEmail = functions.firestore
    .document('users/{userId}')
    .onCreate(async (snap, context) => {
        
        const link = await admin.auth().generateEmailVerificationLink(snap.data().email);
        const mailOptions = {
            from: email_from,
            to: snap.data().email,
            subject: 'confirm registration Go Ubi',
            html: `<h1>User Confirmation</h1>
                                <p>
                                   <b>Please click here </b>${link}<br>
                                </p>`
        };
        console.log(mailOptions);

        transporter.sendMail(mailOptions, (error, data) => {
            if (error) {
                console.log(error)
                return
            }
            console.log("Sent!")
        });
    });