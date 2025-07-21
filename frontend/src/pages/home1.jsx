import React, { useRef, useState, useEffect } from 'react';
import Header from '../page_elements/Header';
import { Helmet } from 'react-helmet';
import samplePattern from '../assets/images/SeasonalityChart_sample_pattern.jpg';
import { Box, Typography, Button, Stack, Avatar, Paper, Tab, Tabs, Card, CardContent, CardActions, Modal } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TimelineIcon from '@mui/icons-material/Timeline';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import ListIcon from '@mui/icons-material/List';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

const Home = () => {
    const avatars = Array(5).fill('/static/avatar.png'); // Пример картинок аватаров
    const [tabIndex, setTabIndex] = React.useState(0);

    const handleTabChange = (event, newValue) => {
        setTabIndex(newValue);
    };

    const tabsContent = [
        { icon: <TimelineIcon />, title: 'Seasonal Patterns', description: 'Identify clear seasonal patterns for your chosen stock or index and refine your trading strategy using data-driven insights.' },
        { icon: <ListIcon />, title: 'Stocks & Indexes', description: 'Access a comprehensive database of over 700 U.S. stocks and indexes.' },
        { icon: <AttachMoneyIcon />, title: 'Historical Trades', description: 'Validate each trade within identified seasonal patterns.' },
        { icon: <AccessTimeIcon />, title: '20 Years of Data', description: 'Analyze 5 to 20 years of stock performance data to uncover both the most recent and longest-lasting seasonal patterns.' },
        { icon: <CompareArrowsIcon />, title: 'Comparison', description: 'Compare historical seasonal patterns with the performance of the recent year.' },
    ];

    const subscriptions = [
        {
            name: 'Monthly',
            price: '$34.99 ',
            originalPrice: '$49.99',
            features: [
                { text: 'Access to Seasonality Analyser', included: true },
                { text: 'Historical trades', included: true },
                { text: 'Over 700 US stocks & indexes', included: true },
                { text: '20 years of data', included: true },
                { text: 'Recent year graph', included: true },
            ],
        },
        {
            name: 'Yearly',
            price: '$314.99',
            originalPrice: '$599.99',
            features: [
                { text: 'Everything in Monthly plan', included: true },
                { text: 'PLUS: Faster data updates', included: true },
                { text: 'PLUS: Early access to new features', included: true },
            ],
        },
    ];

    const [open, setOpen] = useState(false); // Состояние для модального окна

    const handleOpen = () => setOpen(true); // Открытие модального окна
    const handleClose = () => setOpen(false); // Закрытие модального окна

    useEffect(() => {
        const checkHash = () => {
            if (window.location.hash === "#demo") {
                setOpen(true); // Открываем модальное окно
            }
        };
    
        // Проверяем хэш при загрузке страницы
        checkHash();
    
        // Слушаем изменения хэша
        window.addEventListener("hashchange", checkHash);
    
        // Очищаем слушатель при размонтировании компонента
        return () => {
            window.removeEventListener("hashchange", checkHash);
        };
    }, []);

    return (
            <Box sx={{ bgcolor: '#F9F9FA', minHeight: '100vh', padding: { xs: 2, sm: 5 }, paddingTop: { xs: '50px', sm: '170px'}, width: '100%' }}>
                {/* Section 1 */}
                <Stack
                    spacing={4}
                    direction={{ xs: 'column', md: 'row' }}
                    alignItems="top"
                    justifyContent="center"
                    sx={{
                        width: '100%',
                        textAlign: 'center',
                    }}
                >
                    <Box
                        sx={{
                            width: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            paddingBottom: { xs: '20px', sm: '50px'},
                        }}
                    >
                        <Typography
                            variant="h1"
                            sx={{
                                fontSize: { xs: '55px', sm: '85px'},
                                fontFamily: 'Helvetica',
                                fontWeight: '600',
                                marginBottom: 2,
                                textAlign: "center",
                            }}
                        >
                            Stop guessing. Trade with data.
                        </Typography>
                        <Typography variant="body1" sx={{ maxWidth: { xs: '100%', md: '70%' }, marginBottom: 0, fontSize: '18px', fontFamily: 'Helvetica', padding: 1 }}>
                            Discover seasonal patterns and high-performing seasonal trades for over 700 stocks and indexes.
                        </Typography>
                        <Typography variant="body1" sx={{ maxWidth: { xs: '100%', md: '70%' }, marginBottom: 5, fontSize: '18px', fontFamily: 'Helvetica', padding: 1 }}>
                        Say goodbye to guesswork — start making data-driven investment decisions.
                        </Typography>
                        <Stack direction="row" spacing={2} justifyContent="center">
                            <Button variant="contained" size="large" href="/register"
                                sx={{
                                    backgroundColor: "#f5be0d",
                                    color: "black",
                                    "&:hover": { backgroundColor: "#f5cf54", color: "black" },
                                }}>
                                Start 7-day trial
                            </Button>
                            <Button variant="outlined" size="large" onClick={handleOpen} startIcon={<PlayCircleIcon />}
                                sx={{
                                    borderColor: "black",
                                    color: "black",
                                    "&:hover": { backgroundColor: "#fff6d8", color: "black" },
                                }}>
                                Watch Demo
                            </Button>
                        </Stack>
                        {/* Modal для видео */}
                        <Modal
                            open={open}
                            onClose={handleClose}
                            aria-labelledby="modal-title"
                            aria-describedby="modal-description"
                        >
                            <Box
                                sx={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    bgcolor: '#1B1B1B',
                                    boxShadow: 24,
                                    p: 2,
                                    borderRadius: 2,
                                    maxWidth: '800px',
                                    width: '90%',
                                    outline: 'none',
                                }}
                            >
                                {/* Встроенное YouTube-видео */}
                                <Box
                                    component="iframe"
                                    src="https://www.youtube.com/embed/dQw4w9WgXcQ" // Замените на вашу ссылку
                                    title="Demo Video"
                                    width="100%"
                                    height="400px"
                                    sx={{
                                        border: 'none',
                                    }}
                                ></Box>
                                <Button
                                    onClick={handleClose}
                                    variant="contained"
                                    sx={{
                                        display: 'block',
                                        margin: '20px auto 0',
                                        backgroundColor: '#f5be0d',
                                        color: 'black',
                                        '&:hover': { backgroundColor: '#f5cf54', color: 'black' },
                                    }}
                                >
                                    Close
                                </Button>
                            </Box>
                        </Modal>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ marginTop: '15px', marginBottom: 1 }}>
                            <Stack direction="row" spacing={0.01} justifyContent="center">
                                {[...Array(5)].map((_, index) => (
                                    <StarIcon key={index} sx={{ color: '#f5cf54' }} />
                                ))}
                            </Stack>
                            <Typography variant="body2">134 traders already make smarter decisions</Typography>
                        </Stack>
                        <Stack direction="row" spacing={-1} justifyContent="center">
                            {avatars.map((src, idx) => (
                                <Avatar
                                    key={idx}
                                    src={src}
                                    sx={{
                                        border: '2px solid #F9F9FA',
                                    }}
                                />
                            ))}
                        </Stack>
                    </Box>
                </Stack>
                <Box
                    component="img"
                    src={samplePattern}
                    alt="Seasonality Chart"
                    sx={{
                        width: '100%',
                        height: 'auto',
                        borderRadius: 2,
                        boxShadow: 3,
                    }}
                />

                {/* Section 2 - FEATURES */}
                {/* <Box
                    sx={{
                        marginTop: '100px',
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        marginBottom: '50px',
                    }}>
                    <Typography
                        variant="h2"
                        sx={{
                            fontSize: '55px',
                            fontFamily: 'Helvetica',
                            fontWeight: '600',
                            marginBottom: 2,
                            textAlign: "center",
                        }}
                    >
                        Features.
                    </Typography>
                    <Tabs value={tabIndex} onChange={handleTabChange} centered
                        TabIndicatorProps={{
                            sx: {
                                backgroundColor: '#f5cf54',
                                height: '2px',
                            },
                        }}>
                        {tabsContent.map((tab, index) => (
                            <Tab key={index} icon={tab.icon} label={tab.title} sx={{
                                paddingLeft: '50px',
                                paddingRight: '50px',
                                fontFamily: 'Helvetica',
                                fontWeight: '500',
                                color: 'black',
                                "&:hover": { color: "#f6c31e" },
                                "&.Mui-selected": { color: "black" },
                            }} />
                        ))}
                    </Tabs>
                    <Typography variant="body1" sx={{ marginTop: '60px', maxWidth: '600px', fontSize: '18px', textAlign: 'center' }}>{tabsContent[tabIndex].description}</Typography>
                </Box> */}

                {/* Section 3 - PRICING */}
                <Box
                    id="pricing"
                    sx={{
                        marginTop: '100px',
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        marginBottom: '50px',
                    }}>
                    <Typography
                        variant="h2"
                        sx={{
                            fontSize: '55px',
                            fontFamily: 'Helvetica',
                            fontWeight: '600',
                            marginBottom: 2,
                            textAlign: 'center',
                        }}
                    >
                        Pricing.
                    </Typography>
                    <Typography variant="body1" sx={{ maxWidth: { xs: '100%', md: '70%' }, textAlign: 'center', fontSize: '20px', fontFamily: 'Helvetica', padding: 1, paddingBottom: '40px' }}>
                        Save 25% with a Yearly Plan. Start your 7-day free trial now — no credit card required.
                    </Typography>
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: { xs: 'column', md: 'row' },
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: 5,
                            marginTop: 5,
                            width: '100%',
                        }}
                    >
                        {subscriptions.map((plan, index) => (
                            <Box
                                key={index}
                                sx={{
                                    width: { xs: '90%', sm: '90%'},
                                    alignItems: 'center',
                                    padding: '40px',
                                    borderRadius: '10px',
                                    backgroundColor: '#1b1b1b',
                                    boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.5)',
                                    color: '#fff',
                                    display: 'column', // Используем flexbox
                                }}
                            >
                                <Typography variant="h5" sx={{ fontWeight: 'bold', marginBottom: 2 }}>
                                    {plan.name}
                                </Typography>
                                <Typography
                                    variant="body1"
                                    sx={{
                                        textDecoration: 'line-through',
                                        color: '#777',
                                        fontSize: '18px',
                                    }}
                                >
                                    {plan.originalPrice}
                                </Typography>
                                <Box 
                                    sx={{
                                        display: 'inline-flex', // Размещаем цену и USD в одной строке
                                        alignItems: 'baseline', // Выравниваем USD по базовой линии цены
                                    }}
                                    >
                                    <Typography
                                        variant="h3"
                                        sx={{
                                            fontWeight: 'bold',
                                            marginBottom: 1,
                                            display: 'inline',
                                            fontSize: '38px',
                                            justifyContent: 'top',
                                        }}
                                    >
                                        {plan.price}
                                    </Typography>
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            justifyContent: 'center',
                                            verticalAlign: 'top',
                                            marginLeft: 1,
                                            fontSize: '18px',
                                        }}
                                    >
                                        USD
                                    </Typography>
                                </Box>
                                <Stack spacing={1} sx={{ marginTop: 3 }}>
                                    {plan.features.map((feature, idx) => (
                                        <Typography
                                            key={idx}
                                            variant="body2"
                                            sx={{
                                                display: { xs: 'column', sm: 'flex'},
                                                alignItems: 'center',
                                                color: feature.included ? '#fff' : '#777',
                                                fontSize: '16px'
                                            }}
                                        >
                                            {feature.included ? (
                                                <CheckIcon sx={{ color: '#f5cf54', marginRight: 1 }} />
                                            ) : (
                                                <CloseIcon sx={{ color: '#777', marginRight: 1 }} />
                                            )}
                                            {feature.text}
                                        </Typography>
                                    ))}
                                </Stack>
                                <Button
                                    variant="contained"
                                    fullWidth
                                    sx={{
                                        marginTop: '50px',
                                        backgroundColor: "#f5be0d",
                                        color: "black",
                                        "&:hover": { backgroundColor: "#d4ae4a", color: "black" },
                                        fontWeight: 'bold',
                                        padding: '10px',
                                        fontFamily: 'Helvetica'
                                    }}
                                    href="/register"
                                >
                                    Start 7-day trial
                                </Button>
                            </Box>
                        ))}
                    </Box>
                </Box>
                {/* Section 4 - FAQ */}
                {/* <Box 
                    sx={{ 
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        marginTop: '80px',
                        marginBottom: '50px',
                    }}>
                    <Typography 
                            variant="h2" 
                            sx={{ 
                                fontSize: '55px',
                                fontFamily: 'Helvetica',
                                fontWeight: '600',
                                marginBottom: 2, 
                                textAlign: "center" // Центрируем текст
                            }}
                    >
                            FAQ.
                    </Typography>
                </Box> */}
                {/* Section 5 - CTA */}
                <Box sx={{ 
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    marginTop: '80px',
                    marginBottom: '100px'
                    }}>
                    <Typography 
                            variant="h2" 
                            sx={{ 
                                fontSize: '40px',
                                fontFamily: 'Helvetica',
                                fontWeight: '600',
                                textAlign: "center" // Центрируем текст
                            }}
                    >
                            134 users are already trading smarter.
                    </Typography>
                    <Typography variant="body1" sx={{ maxWidth:'70%', fontSize: '20px', textAlign: 'center', fontFamily: 'Helvetica', padding: 1, paddingBottom: '60px'}}>
                            Don't waste your money on bad trades.
                    </Typography>
                    <Button variant="contained" size="large" href="/register"
                            sx={{ 
                                backgroundColor: "#f5be0d",
                                color: "black",
                                "&:hover": { backgroundColor: "#f5cf54", color: "black" },
                                padding: 1.5,
                                paddingLeft: 6,
                                paddingRight: 6,
                                }}>
                        Get Started
                    </Button>
                </Box>
            </Box>
        );
};

export default Home;